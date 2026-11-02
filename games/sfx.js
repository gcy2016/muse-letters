/* 童年游戏 · 共用音效（全部用 WebAudio 现场合成，不需要音频文件）
 *
 * 用法：页面里 <script src="../sfx.js"></script>，然后调用
 *   SFX.play('dirtFlip')            立刻播放
 *   SFX.play('dirtThud', 0.45)      0.45 秒后播放（等走子动画落地）
 * 页面左下角会自动出现一个 🔊/🔇 静音按钮，静音状态所有游戏共用。
 *
 * 音色分组：
 *   dirt*   三个翻牌游戏：小时候在土地上画格子、拿石子/纸牌玩的声音
 *   wood*   象棋：木头棋子落在木棋盘上
 *   beep*   弹球掉梯子：诺基亚蜂鸣器
 *   tile*   2048
 *   win / lose  结束时的小旋律
 */
(function(){
  var AC=window.AudioContext||window.webkitAudioContext;
  var ctx=null,master=null,noiseBuf=null,gritBuf=null;
  var muted=false;
  try{muted=localStorage.getItem('sfx_muted')==='1';}catch(e){}

  function init(){
    if(ctx||!AC)return ctx;
    try{
      ctx=new AC();
      master=ctx.createGain();master.gain.value=0.9;master.connect(ctx.destination);
      // 白噪声
      var n=ctx.sampleRate;
      noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate);
      var d=noiseBuf.getChannelData(0);
      for(var i=0;i<n;i++)d[i]=Math.random()*2-1;
      // 沙土颗粒声：稀疏的小脉冲叠在弱噪声上，像树枝刮过土里的小石子
      gritBuf=ctx.createBuffer(1,n,ctx.sampleRate);
      var g=gritBuf.getChannelData(0);
      for(var j=0;j<n;j++){
        var v=(Math.random()*2-1)*0.25;
        if(Math.random()<0.012)v+=(Math.random()*2-1)*1.6;
        g[j]=Math.max(-1,Math.min(1,v));
      }
    }catch(e){ctx=null;}
    return ctx;
  }
  // iOS/Chrome 要求用户先点一下页面才能出声。手机上还有几个电脑复现不出来的坑：
  //  1) 切到后台、来电、切 App 回来，状态可能是 'interrupted' 而不是 'suspended'，
  //     以前只认 'suspended'，回来后就一直没声音；
  //  2) 钉钉、微信内置浏览器里，光 resume 不够，要在点击当下真的播一下（哪怕是静音）才算解锁；
  //  3) iPhone 侧边静音开关打开时 WebAudio 默认不出声，要先把音频会话切到“播放”类型。
  var unlocked=false,silentTag=null;
  function wake(){
    if(!ctx||ctx.state==='running')return null;
    try{return ctx.resume();}catch(e){return null;}
  }
  function isIOS(){
    return /iPhone|iPad|iPod/.test(navigator.userAgent)||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  }
  function silentWav(){
    // 0.5 秒 8kHz 单声道静音 wav
    var n=4000,b=new Uint8Array(44+n),v=new DataView(b.buffer);
    function str(o,s){for(var i=0;i<s.length;i++)b[o+i]=s.charCodeAt(i);}
    str(0,'RIFF');v.setUint32(4,36+n,true);str(8,'WAVE');str(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);
    str(36,'data');v.setUint32(40,n,true);
    for(var i=0;i<n;i++)b[44+i]=128;
    var s='';for(var j=0;j<b.length;j++)s+=String.fromCharCode(b[j]);
    return 'data:audio/wav;base64,'+btoa(s);
  }
  function keepRingerOn(){
    // 新 Safari 直接声明成播放类型；老版本靠一段循环的静音 <audio> 顶住侧边静音开关
    try{
      if(navigator.audioSession){
        if(navigator.audioSession.type!=='playback')navigator.audioSession.type='playback';
        return;
      }
    }catch(e){}
    if(!isIOS())return;
    try{
      if(!silentTag){
        silentTag=document.createElement('audio');
        silentTag.setAttribute('playsinline','');
        silentTag.setAttribute('x-webkit-airplay','deny');
        silentTag.setAttribute('aria-hidden','true');
        silentTag.preload='auto';
        silentTag.loop=true;
        silentTag.src=silentWav();
        silentTag.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        if(document.body)document.body.appendChild(silentTag);
      }
      if(silentTag.paused){
        var p=silentTag.play();
        if(p&&p.catch)p.catch(function(){});
      }
    }catch(e){}
  }
  function stopSilent(){
    if(silentTag){try{silentTag.pause();}catch(e){}}
  }
  function unlock(){
    if(!init())return;
    wake();
    if(muted)return;
    keepRingerOn();
    if(!unlocked||ctx.state!=='running'){
      // 点击当下播一个 1 帧的静音 buffer，钉钉/微信里才算真的解锁；被打断后再点会重放
      try{
        var src=ctx.createBufferSource();
        src.buffer=ctx.createBuffer(1,1,22050);
        src.connect(ctx.destination);src.start(0);
        unlocked=true;
      }catch(e){}
    }
  }
  ['pointerdown','touchstart','touchend','mousedown','keydown','click'].forEach(function(ev){
    window.addEventListener(ev,unlock,{capture:true,passive:true});
  });
  // 从后台切回来时把声音叫醒；切走时先停掉静音 <audio>，免得锁屏上出现播放条
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){stopSilent();}
    else if(!muted){wake();keepRingerOn();}
  });
  window.addEventListener('pageshow',function(){if(!muted){wake();keepRingerOn();}});

  // ---------- 基础积木 ----------
  function env(g,t,a,peak,dec){
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(peak,t+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec);
  }
  // 一段滤波噪声
  function noise(t,o){
    var src=ctx.createBufferSource();
    src.buffer=o.grit?gritBuf:noiseBuf;
    src.playbackRate.value=o.rate||1;
    var f=ctx.createBiquadFilter();
    f.type=o.type||'bandpass';
    f.frequency.setValueAtTime(o.f,t);
    if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+(o.a||0.005)+o.dec);
    f.Q.value=o.q||1;
    var g=ctx.createGain();
    env(g,t,o.a||0.005,o.v,o.dec);
    src.connect(f);f.connect(g);g.connect(master);
    src.start(t,Math.random()*0.5);src.stop(t+(o.a||0.005)+o.dec+0.05);
  }
  // 一个音
  function tone(t,o){
    var osc=ctx.createOscillator();
    osc.type=o.wave||'sine';
    osc.frequency.setValueAtTime(o.f,t);
    if(o.f2)osc.frequency.exponentialRampToValueAtTime(o.f2,t+(o.a||0.005)+o.dec);
    var g=ctx.createGain();
    env(g,t,o.a||0.005,o.v,o.dec);
    osc.connect(g);g.connect(master);
    osc.start(t);osc.stop(t+(o.a||0.005)+o.dec+0.05);
  }
  // 方波短音（诺基亚蜂鸣器），起止干脆
  function beep(t,f,dur,v){
    var osc=ctx.createOscillator();osc.type='square';osc.frequency.value=f;
    var g=ctx.createGain();
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.004);
    g.gain.setValueAtTime(v,t+dur-0.01);g.gain.linearRampToValueAtTime(0,t+dur);
    osc.connect(g);g.connect(master);osc.start(t);osc.stop(t+dur+0.02);
  }

  // ---------- 音效表 ----------
  var S={
    // ===== 土地（兽棋 / 刀杀鸡 / 军棋）=====
    // 翻牌：手指把纸牌从土上掀起来 "唰"，带点沙粒
    dirtFlip:function(t){
      noise(t,{grit:true,f:2600,f2:1500,q:0.9,v:0.55,a:0.01,dec:0.16});
      noise(t+0.02,{f:5200,type:'highpass',v:0.10,a:0.005,dec:0.07});
    },
    // 走子：在土上拖过去 "沙——"
    dirtSlide:function(t){
      noise(t,{grit:true,f:1400,f2:900,q:0.7,v:0.35,a:0.06,dec:0.32});
    },
    // 落子：拍在土上 "噗"
    dirtPlace:function(t){
      tone(t,{f:150,f2:70,v:0.45,dec:0.09});
      noise(t,{type:'lowpass',f:700,v:0.35,dec:0.08});
    },
    // 吃子：用力拍下去 + 土渣飞溅
    dirtThud:function(t){
      tone(t,{f:120,f2:45,v:0.85,dec:0.16});
      noise(t,{type:'lowpass',f:900,f2:300,v:0.6,dec:0.14});
      noise(t+0.03,{grit:true,f:3000,q:0.8,v:0.28,a:0.005,dec:0.18});
    },
    // 同归于尽 / 炸弹 / 火箭："嘭" 再撒一把土
    dirtBoom:function(t){
      tone(t,{f:90,f2:30,v:1.0,dec:0.35});
      noise(t,{type:'lowpass',f:1200,f2:120,v:0.9,a:0.005,dec:0.45});
      noise(t+0.08,{grit:true,f:2400,f2:1200,q:0.6,v:0.35,a:0.02,dec:0.4});
    },
    // 选中棋子：手指点了一下土
    dirtTap:function(t){
      noise(t,{type:'lowpass',f:1200,v:0.18,dec:0.035});
    },

    // ===== 木头（象棋）=====
    woodPick:function(t){
      noise(t,{f:2600,q:4,v:0.18,dec:0.03});
      tone(t,{f:1300,v:0.07,dec:0.03});
    },
    // 落子 "哒"
    woodPlace:function(t){
      noise(t,{f:1900,q:3.5,v:0.7,a:0.002,dec:0.05});
      tone(t,{f:820,f2:700,v:0.32,a:0.002,dec:0.07});
      tone(t,{f:240,f2:180,v:0.35,a:0.002,dec:0.10});
    },
    // 吃子：重重拍下，两颗棋子相撞 "啪嗒"
    woodCapture:function(t){
      noise(t,{f:1500,q:2.5,v:0.95,a:0.002,dec:0.07});
      tone(t,{f:640,f2:520,v:0.45,a:0.002,dec:0.09});
      tone(t,{f:190,f2:130,v:0.55,a:0.002,dec:0.14});
      noise(t+0.07,{f:2600,q:4,v:0.35,a:0.002,dec:0.04});
      tone(t+0.07,{f:1050,v:0.15,a:0.002,dec:0.05});
    },
    // 将军：两声清脆的提示
    woodCheck:function(t){
      tone(t,{f:988,v:0.22,dec:0.12,wave:'triangle'});
      tone(t+0.13,{f:1319,v:0.22,dec:0.2,wave:'triangle'});
    },

    // ===== 诺基亚蜂鸣器（弹球掉梯子）=====
    beepStart:function(t){beep(t,1047,0.07,0.12);beep(t+0.09,1568,0.1,0.12);},
    beepLand:function(t){beep(t,1760,0.018,0.05);},
    beepHeart:function(t){beep(t,1319,0.06,0.12);beep(t+0.07,1760,0.06,0.12);beep(t+0.14,2637,0.1,0.12);},
    beepDie:function(t){
      var osc=ctx.createOscillator();osc.type='square';
      osc.frequency.setValueAtTime(880,t);osc.frequency.exponentialRampToValueAtTime(110,t+0.45);
      var g=ctx.createGain();g.gain.setValueAtTime(0.12,t);g.gain.linearRampToValueAtTime(0,t+0.48);
      osc.connect(g);g.connect(master);osc.start(t);osc.stop(t+0.5);
    },
    beepLevel:function(t){beep(t,2093,0.05,0.1);beep(t+0.08,2093,0.05,0.1);},
    beepOver:function(t){
      [784,659,523,392].forEach(function(f,i){beep(t+i*0.16,f,0.13,0.12);});
    },

    // ===== 2048 =====
    tileSlide:function(t){noise(t,{type:'bandpass',f:1800,f2:900,q:0.8,v:0.12,a:0.01,dec:0.08});},
    tileMerge:function(t,v){
      var lv=Math.log2(v||4);   // 4→2, 2048→11
      var f=260*Math.pow(1.12,lv);
      tone(t,{f:f,f2:f*1.5,v:0.28,a:0.005,dec:0.12,wave:'triangle'});
      tone(t,{f:f*2,v:0.06,a:0.005,dec:0.08});
    },

    // ===== 声音按钮的反馈（要够响，手机外放也能听见）=====
    uiOn:function(t){
      tone(t,{f:880,v:0.22,dec:0.09,wave:'triangle'});
      tone(t+0.11,{f:1320,v:0.22,dec:0.14,wave:'triangle'});
    },
    uiOff:function(t){
      tone(t,{f:660,v:0.2,dec:0.09,wave:'triangle'});
      tone(t+0.09,{f:440,v:0.2,dec:0.14,wave:'triangle'});
    },

    // ===== 结束 =====
    win:function(t){
      [523,659,784,1047].forEach(function(f,i){tone(t+i*0.11,{f:f,v:0.22,dec:0.25,wave:'triangle'});});
    },
    lose:function(t){
      [392,349,311,262].forEach(function(f,i){tone(t+i*0.16,{f:f,v:0.2,dec:0.3,wave:'triangle'});});
    }
  };

  var SFX={
    play:function(name,delay,arg){
      if(muted||!S[name])return;
      if(!init())return;
      var go=function(){
        try{S[name](ctx.currentTime+0.005+(delay||0),arg);}catch(e){if(SFX.debug)console.error('SFX '+name,e);}
      };
      // 还在挂起/被打断时先唤醒，等真的 running 了再排声音，免得手机上前半声被吞掉
      var p=wake();
      if(p&&p.then)p.then(go,go);else go();
    },
    // 按结局文字自动判断胜负音
    result:function(text){
      text=String(text||'');
      if(/你赢|你获胜/.test(text))SFX.play('win');
      else if(/平局|和棋/.test(text))SFX.play('woodCheck');
      else if(/赢|获胜|胜/.test(text))SFX.play('lose');
    },
    // 翻牌游戏共用：kind = flip | move | capture | boom
    // 走子有 0.45 秒滑动动画，落地声等动画到位再响
    dirt:function(kind){
      if(kind==='flip'){SFX.play('dirtFlip');return;}
      SFX.play('dirtSlide');
      SFX.play(kind==='capture'?'dirtThud':kind==='boom'?'dirtBoom':'dirtPlace',0.42);
    },
    isMuted:function(){return muted;},
    setMuted:function(m){
      muted=!!m;
      try{localStorage.setItem('sfx_muted',muted?'1':'0');}catch(e){}
      syncBtn();
      if(muted)stopSilent();
      else unlock();
    }
  };
  window.SFX=SFX;

  function syncBtn(){
    if(!btn)return;
    btn.textContent=muted?'🔇':'🔊';
    btn.setAttribute('aria-pressed',muted?'true':'false');
    btn.title=muted?'声音已关，点一下打开':'声音已开，点一下关闭';
  }

  // ---------- 静音按钮 ----------
  var btn=null;
  function mount(){
    if(btn||!document.body)return;
    btn=document.createElement('button');
    btn.type='button';
    btn.setAttribute('aria-label','声音开关');
    syncBtn();
    // 手机上避开底部手势区和刘海（safe-area），按钮做大到 40px，层级拉到最高，别被结束弹层盖住
    btn.style.cssText='position:fixed;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483647;width:40px;height:40px;border-radius:50%;opacity:.8;'+
      'border:none;background:rgba(0,0,0,.45);color:#fff;font-size:19px;line-height:40px;padding:0;cursor:pointer;'+
      '-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;-webkit-user-select:none';
    // 别让游戏自己的 pointerdown / touchstart 抢走这一下
    ['pointerdown','touchstart'].forEach(function(ev){
      btn.addEventListener(ev,function(e){e.stopPropagation();},{passive:true});
    });
    btn.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      if(muted){
        // 先开声音再响，确保这次点击有清楚反馈
        SFX.setMuted(false);
        SFX.play('uiOn');
      }else{
        SFX.play('uiOff');
        SFX.setMuted(true);
      }
    });
    document.body.appendChild(btn);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
  else mount();
  // 别的标签页/游戏改了静音状态时，这边的图标跟着变，别出现“图标 🔊 实际静音”
  window.addEventListener('storage',function(e){
    if(e.key&&e.key!=='sfx_muted')return;
    muted=e.newValue==='1';
    syncBtn();
    if(muted)stopSilent();
    else wake();
  });
})();
