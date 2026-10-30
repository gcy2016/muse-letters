# 自动查天气：工作流 .github/workflows/weather.yml 每天跑三次（北京时间约 9 点、14 点、19 点），
# 从 Open-Meteo（免费、不用注册）查重庆、武汉今天起三天的预报和空气质量，写成 weather.json，推到 weather-data 分支。
# 网页（weather-data.js）读这个文件：北京时间 19 点前显示今天，19 点后显示明天。
# 每天写成和 Muse 以前发的 [天气] 帖子一样的一行（“小雨 14~18°C 降水80% 东北风2级”），网页照旧用 parseDay 解析。
#   python3 tools/fetch_weather.py 旧的weather.json 新的weather.json
#   某个城市这次没查到，就留着旧文件里它的数据（里面本来就有今天起三天的预报）。
#   离线试跑：FAKE_DIR=目录 时从 目录/<id>-forecast.json、目录/<id>-air.json 读，不联网。
import json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

# id 和 config.js 的 weatherSources 对上；坐标只精确到区（重庆两江新区、武汉洪山区）
CITIES = [
    {"id": "cq", "city": "重庆", "lat": 29.65, "lon": 106.56},
    {"id": "wh", "city": "武汉", "lat": 30.50, "lon": 114.34},
]
BJ = timezone(timedelta(hours=8))

# Open-Meteo 的天气代码（WMO）→ weather-data.js 认识的天气用词
CODES = {
    0: "晴", 1: "晴", 2: "多云", 3: "阴", 45: "雾", 48: "雾",
    51: "小雨", 53: "小雨", 55: "小雨", 56: "雨夹雪", 57: "雨夹雪",
    61: "小雨", 63: "中雨", 65: "大雨", 66: "雨夹雪", 67: "雨夹雪",
    71: "小雪", 73: "中雪", 75: "大雪", 77: "小雪",
    80: "阵雨", 81: "中雨", 82: "暴雨", 85: "小雪", 86: "大雪",
    95: "雷阵雨", 96: "雷阵雨", 99: "雷阵雨",
}
DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]


def get(url, params, fake):
    if os.environ.get("FAKE_DIR"):
        return json.load(open(os.path.join(os.environ["FAKE_DIR"], fake), encoding="utf-8"))
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "muse-letters-weather"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def wind(kmh, deg):
    # 风速（km/h）→ 风力等级（蒲福风级），2 级以下叫微风
    ms = (kmh or 0) / 3.6
    level = next((i for i, top in enumerate([0.2, 1.5, 3.3, 5.4, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6]) if ms <= top), 12)
    if level < 2 or deg is None:
        return "微风"
    return "%s风%d级" % (DIRS[int((deg + 22.5) % 360 // 45)], level)


def air(aqi):
    # 美标 AQI 和国标分档一样：优、良、轻度、中度、重度、严重
    if aqi is None:
        return ""
    for top, name in [(50, "优"), (100, "良"), (150, "轻度污染"), (200, "中度污染"), (300, "重度污染")]:
        if aqi <= top:
            return name
    return "严重污染"


def tip(text, lo, hi, rain, aqi):
    t = []
    if rain is not None and rain >= 50 or "雨" in text or "雪" in text:
        t.append("出门带伞")
    if hi is not None and hi >= 35:
        t.append("天热，注意防暑")
    elif lo is not None and lo <= 5:
        t.append("天冷，注意保暖")
    if lo is not None and hi is not None and hi - lo >= 10:
        t.append("早晚温差大，加件外套")
    if aqi is not None and aqi > 100:
        t.append("空气不太好，少开窗")
    return "，".join(t)


def fetch(c):
    f = get("https://api.open-meteo.com/v1/forecast", {
        "latitude": c["lat"], "longitude": c["lon"], "timezone": "Asia/Shanghai", "forecast_days": 3,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant",
    }, c["id"] + "-forecast.json")["daily"]
    # 空气质量查不到不要紧，天气照样写
    try:
        a = get("https://air-quality-api.open-meteo.com/v1/air-quality", {
            "latitude": c["lat"], "longitude": c["lon"], "timezone": "Asia/Shanghai", "forecast_days": 3, "hourly": "us_aqi",
        }, c["id"] + "-air.json")["hourly"]
        aqi = {}
        for t, v in zip(a["time"], a["us_aqi"]):
            if v is not None:
                aqi[t[:10]] = max(aqi.get(t[:10], 0), v)
    except Exception as e:
        print("  %s 空气质量没查到：%s" % (c["city"], e))
        aqi = {}
    days = []
    for i, date in enumerate(f["time"]):
        text = CODES.get(f["weather_code"][i], "")
        lo, hi = f["temperature_2m_min"][i], f["temperature_2m_max"][i]
        lo = round(lo) if lo is not None else None
        hi = round(hi) if hi is not None else None
        rain = f["precipitation_probability_max"][i]
        parts = [text]
        if lo is not None and hi is not None:
            parts.append("%d~%d°C" % (lo, hi))
        if rain is not None:
            parts.append("降水%d%%" % rain)
        parts.append(wind(f["wind_speed_10m_max"][i], f["wind_direction_10m_dominant"][i]))
        q = aqi.get(date)
        days.append({"date": date, "line": " ".join(p for p in parts if p), "air": air(q), "tip": tip(text, lo, hi, rain, q)})
    return days


def main(old_path, new_path):
    try:
        old = json.load(open(old_path, encoding="utf-8"))
    except Exception:
        old = {"places": []}
    now = datetime.now(BJ).strftime("%Y-%m-%d %H:%M")
    out = {"source": "Open-Meteo", "places": []}
    ok = 0
    for c in CITIES:
        prev = next((p for p in old.get("places", []) if p.get("id") == c["id"]), None)
        try:
            out["places"].append({"id": c["id"], "city": c["city"], "updated": now, "days": fetch(c)})
            ok += 1
            print("%s：%s" % (c["city"], out["places"][-1]["days"][0]["line"]))
        except Exception as e:
            print("%s 这次没查到，留着上次的：%s" % (c["city"], e))
            if prev:
                out["places"].append(prev)
    json.dump(out, open(new_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if not ok:
        sys.exit("一个城市都没查到")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
