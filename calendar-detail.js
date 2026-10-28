// 日历详情（DOM）：房子里点日历小屏弹出的、日历页面下面显示的，都是这个。倒计时、日程都只列今天及以后的。
//   import { calendarDetail, CALENDAR_CSS } from "./calendar-detail.js";
//   box.append(calendarDetail(cals, error)); // cals 是 loadCalendars 的结果
import { upcoming, countdownText, dayLabel } from "./calendar-data.js";

function mk(tag, attrs, kids) {
  var e = Object.assign(document.createElement(tag), attrs || {});
  (kids || []).forEach(function (k) { if (k) e.append(k); });
  return e;
}
function fmtTime(iso) {
  var d = new Date(iso), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + p(d.getHours()) + ":" + p(d.getMinutes());
}
export function calendarDetail(cals, error) {
  var box = mk("div", { className: "cal" });
  if (!cals) { box.append(mk("p", { textContent: error ? "日历没加载出来：" + error : "加载中…" })); return box; }
  var now = new Date();
  cals.forEach(function (cal) {
    var card = mk("div", { className: "cal-card" }, [mk("h3", { textContent: cal.owner + "的日历" })]);
    if (!cal.has) { card.append(mk("p", { className: "cal-muted", textContent: "还没有日历（由 " + cal.who + " 提供）。" })); box.append(card); return; }
    if (cal.bad) { card.append(mk("p", { className: "cal-warn", textContent: "这条解不开（可能是改密码前留的），请 " + cal.who + " 重新留言。" })); box.append(card); return; }
    var u = upcoming(cal, now);
    card.append(mk("h4", { textContent: "倒计时" }));
    if (!u.reminders.length) card.append(mk("p", { className: "cal-muted", textContent: "没有提醒。" }));
    u.reminders.forEach(function (r) {
      card.append(mk("div", { className: "cal-count" }, [
        mk("span", { textContent: countdownText(r, now) }),
        mk("small", { textContent: dayLabel(r.date, now) }),
      ]));
    });
    card.append(mk("h4", { textContent: "日程" }));
    if (!u.events.length) card.append(mk("p", { className: "cal-muted", textContent: "近期没有日程。" }));
    u.events.forEach(function (e) {
      card.append(mk("div", { className: "cal-event" }, [
        mk("b", { textContent: dayLabel(e.date, now) + (e.time ? " " + e.time : "") }),
        mk("div", { textContent: e.text }),
      ]));
    });
    if (cal.other.length) card.append(mk("div", { className: "cal-muted cal-other", textContent: cal.other.join("\n") }));
    card.append(mk("p", { className: "cal-muted", textContent: cal.who + " " + fmtTime(cal.created_at) + " 更新" +
      (cal.plain ? "（这条没加密，GitHub 上谁都看得到）" : "") }));
    box.append(card);
  });
  return box;
}
export var CALENDAR_CSS =
  ".cal{padding:56px 18px 18px;color:#3d3027;overflow:auto;height:100%;box-sizing:border-box}" +
  ".cal-card{background:#fff;border-radius:14px;padding:14px;margin:0 0 12px;box-shadow:0 1px 6px rgba(0,0,0,.08)}" +
  ".cal h3{margin:0 0 6px;font-size:19px}.cal h4{margin:14px 0 6px;font-size:16px;color:#e0605a}" +
  ".cal-count{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:8px 10px;margin:6px 0;background:#fff4ef;border-radius:10px;font-size:17px;font-weight:600}" +
  ".cal-count small{color:#8a7d74;font-weight:normal;font-size:13px;white-space:nowrap}" +
  ".cal-event{padding:6px 0;border-bottom:1px solid #f1e8e0}.cal-event b{font-size:14px;color:#6b5a4e}" +
  ".cal-muted{color:#8a7d74;font-size:13px}.cal-warn{color:#c2770c}.cal-other{white-space:pre-wrap;margin-top:8px}";
