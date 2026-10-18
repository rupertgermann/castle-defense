// HUD stylesheet: leather, parchment, forged iron and gold leaf. Pure CSS, no assets.
const grain = (a, f = .85) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${a} 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const blotch = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='4' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .27 0 0 0 0 .08 0 0 0 -1.6 1.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export const CSS = `
#cd{--serif:"Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style","URW Palladio L",Georgia,serif;
--ink:#2e1d0f;--ink2:#5b3f22;--txt:#f4e7c6;--txt2:#cdb88f;--gold:#e7bd5a;--gold-hi:#fff0b5;--gold-lo:#8d6420;--red:#b3261c;--green:#5f9d3a;
--rim:linear-gradient(170deg,#fff0b0 0%,#d9a948 22%,#7d561b 50%,#e3b95c 78%,#8a6420 100%);
--leather:radial-gradient(circle at 7px 7px,#fff1b8 0 1.3px,#b98a32 1.9px,#3a2708 2.5px,transparent 3px),radial-gradient(circle at calc(100% - 7px) 7px,#fff1b8 0 1.3px,#b98a32 1.9px,#3a2708 2.5px,transparent 3px),radial-gradient(circle at 7px calc(100% - 7px),#fff1b8 0 1.3px,#b98a32 1.9px,#3a2708 2.5px,transparent 3px),radial-gradient(circle at calc(100% - 7px) calc(100% - 7px),#fff1b8 0 1.3px,#b98a32 1.9px,#3a2708 2.5px,transparent 3px),${grain(.42)},radial-gradient(130% 160% at 50% -10%,#47321f 0%,#2a1c11 55%,#170f08 100%);
--parch:${grain(.3, .7)},${blotch} center/cover no-repeat,radial-gradient(120% 120% at 50% 40%,#f6ead0 0%,#ead7ad 55%,#d2b47b 100%);
--iron:${grain(.35)},linear-gradient(180deg,#5b564e 0%,#3a3630 48%,#24211d 52%,#302c27 100%);
position:fixed;inset:0;pointer-events:none;font-family:var(--serif);color:var(--txt);z-index:10;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-size:15px;line-height:1.25}
#cd *{box-sizing:border-box}
#cd button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0;pointer-events:auto}
#cd button:focus-visible{outline:2px solid var(--gold-hi);outline-offset:3px}
#cd .ic{width:1em;height:1em;flex:none;display:inline-block;vertical-align:middle;overflow:visible}
#cd .sc{font-variant:small-caps;letter-spacing:.09em}

/* Framed surfaces: gold-leaf rim drawn with a border-box gradient behind the padding-box fill. */
#cd .leather{border:1.5px solid transparent;border-radius:10px;background:var(--leather) padding-box,var(--rim) border-box;
 box-shadow:0 0 0 1px #0c0704,0 10px 26px -8px rgba(0,0,0,.75),0 2px 6px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,226,160,.22),inset 0 0 16px rgba(0,0,0,.6)}
#cd .parch{border:1.5px solid transparent;border-radius:8px;color:var(--ink);background:var(--parch) padding-box,var(--rim) border-box;
 box-shadow:0 0 0 1px #2a1a0c,0 12px 28px -10px rgba(0,0,0,.7),inset 0 0 22px rgba(120,66,16,.45),inset 0 0 3px rgba(80,40,8,.5)}

/* ── Top bar ── */
#cd .top{position:absolute;left:0;right:0;top:0;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 16px 0;transition:transform .6s cubic-bezier(.2,.8,.2,1),opacity .5s,visibility .5s}
#cd.ended .top,#cd.ended .hint{opacity:0;pointer-events:none;visibility:hidden}
#cd.intro .top{transform:translateY(-130%);opacity:0;visibility:hidden}
#cd .res{display:flex;align-items:center;height:58px;padding:0 6px;pointer-events:auto}
#cd .stat{display:flex;align-items:center;gap:9px;padding:0 15px;height:100%;position:relative}
#cd .stat .ic{font-size:27px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))}
#cd .stat b{font-size:25px;font-weight:700;font-variant-numeric:lining-nums tabular-nums;background-image:linear-gradient(#fff6d2,#f0c867 55%,#c89231);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 1.5px 0 #1a0f02) drop-shadow(0 2px 4px rgba(0,0,0,.7))}
#cd .stat small{font-size:14px;color:var(--txt2);margin-left:-5px;align-self:flex-end;margin-bottom:15px}
#cd .stat .lbl{font-size:12px;color:var(--txt2);font-variant:small-caps;letter-spacing:.14em;margin-right:-3px}
#cd .stat.lives b{background-image:linear-gradient(#fff,#ffd9cf 50%,#e98c78)}
#cd .stat.wave b{background-image:linear-gradient(#fff,#eee3cc 50%,#c2b08a)}
#cd .stat.wave .ic{color:#e8dcc0;font-size:25px}
#cd .sep{width:1px;height:30px;background:linear-gradient(transparent,rgba(231,189,90,.6),transparent);box-shadow:1px 0 0 rgba(0,0,0,.6)}
#cd .stat.gain .ic{animation:cdCoin .7s cubic-bezier(.3,1.6,.5,1)}
#cd .stat.gain b{animation:cdGlow .9s ease-out}
#cd .stat.hurt .ic{animation:cdShake .55s ease-in-out}
#cd .stat.hurt b{animation:cdRed .9s ease-out}
#cd .stat.poor{animation:cdPoor .45s ease-in-out}
@keyframes cdCoin{0%{transform:scale(1)}35%{transform:scale(1.35) rotateY(180deg)}100%{transform:scale(1) rotateY(360deg)}}
@keyframes cdGlow{0%{filter:drop-shadow(0 0 10px #ffd760) brightness(1.5)}}
@keyframes cdShake{0%,100%{transform:none}15%{transform:translateX(-4px) rotate(-10deg) scale(1.2)}35%{transform:translateX(4px) rotate(8deg) scale(1.15)}55%{transform:translateX(-3px) rotate(-5deg)}75%{transform:translateX(2px)}}
@keyframes cdRed{0%{filter:drop-shadow(0 0 12px #ff2a10) brightness(1.3)}}
@keyframes cdPoor{0%,100%{transform:none}25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}

/* Herald: next-wave scroll + horn */
#cd .herald{display:flex;align-items:stretch;gap:0;pointer-events:auto;min-width:0}
#cd .preview{display:flex;flex-direction:column;justify-content:center;gap:4px;padding:6px 16px 7px 18px;min-width:300px;border-radius:8px 0 0 8px;border-right:0;height:58px}
#cd .pv-head{display:flex;align-items:baseline;gap:10px;white-space:nowrap}
#cd .pv-k{font-size:11.5px;font-variant:small-caps;letter-spacing:.16em;color:var(--ink2);font-weight:700}
#cd .pv-name{font-size:16px;font-style:italic;color:var(--ink);font-weight:700;overflow:hidden;text-overflow:ellipsis}
#cd .pv-name.boss{color:#8d1a12}
#cd .pv-list{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}
#cd .en{display:flex;align-items:center;gap:3px;height:26px;padding:0 7px 0 3px;border-radius:13px;background:linear-gradient(#3a2818,#23170d);box-shadow:inset 0 0 0 1px rgba(231,189,90,.55),0 1px 2px rgba(0,0,0,.5);color:var(--txt);position:relative}
#cd .en .ic{font-size:20px;color:#e9d6b0;filter:drop-shadow(0 1px 1px #000)}
#cd .en b{font-size:13.5px;font-variant-numeric:tabular-nums;color:var(--gold-hi)}
#cd .en.boss{background:linear-gradient(#6d1a12,#3a0b07);box-shadow:inset 0 0 0 1px #f0c060,0 0 10px rgba(255,80,40,.45)}
#cd .preview{position:relative}
#cd .preview:has(.pv-bar:not([hidden])){padding-bottom:11px}
#cd .pv-bar{position:absolute;left:10px;right:10px;bottom:4px;height:4px;border-radius:3px;background:rgba(58,36,18,.55);box-shadow:inset 0 1px 1px rgba(0,0,0,.6);overflow:hidden}
#cd .pv-bar i{display:block;height:100%;width:0;background:linear-gradient(#f07f5c,#a8251a 60%,#6d130d);border-radius:4px;transition:width .35s}
#cd .horn{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:132px;padding:6px 16px;border:1.5px solid transparent;border-radius:0 10px 10px 0;
 background:${grain(.3)} padding-box,linear-gradient(180deg,#b43424 0%,#7c1a10 55%,#5a0f09 100%) padding-box,var(--rim) border-box;
 box-shadow:0 0 0 1px #140604,0 10px 22px -8px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,200,160,.45),inset 0 -6px 14px rgba(0,0,0,.35);transition:transform .15s,filter .2s}
#cd .horn .row{display:flex;align-items:center;gap:8px;font-size:16.5px;font-weight:700;font-variant:small-caps;letter-spacing:.08em;color:#fff3d6;text-shadow:0 1px 0 #3a0703,0 0 10px rgba(255,160,90,.35);white-space:nowrap}
#cd .horn .row .ic{font-size:28px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6));transform-origin:30% 60%}
#cd .horn .sub{display:flex;align-items:center;gap:10px;font-size:12.5px;color:#f5d7b8;font-variant-numeric:tabular-nums;white-space:nowrap}
#cd .horn .sub .ic{font-size:14px}
#cd .horn .sub .bonus{color:#ffe28a;display:flex;align-items:center;gap:3px;font-weight:700}
#cd .horn:hover{filter:brightness(1.14) saturate(1.1)}
#cd .horn:hover .row .ic{animation:cdHorn .6s ease-in-out}
#cd .horn:active{transform:translateY(1px);filter:brightness(.95)}
#cd .horn.ready::after{content:"";position:absolute;inset:-1px;border-radius:inherit;box-shadow:0 0 0 0 rgba(255,210,110,.7);animation:cdPulse 1.8s infinite;pointer-events:none}
#cd .horn[disabled]{cursor:default;filter:saturate(.25) brightness(.7)}
#cd .horn[disabled] .row .ic{animation:none}
@keyframes cdHorn{0%,100%{transform:none}30%{transform:rotate(-12deg) scale(1.1)}60%{transform:rotate(6deg)}}
@keyframes cdPulse{0%{box-shadow:0 0 0 0 rgba(255,210,110,.75)}70%{box-shadow:0 0 0 12px rgba(255,210,110,0)}100%{box-shadow:0 0 0 0 rgba(255,210,110,0)}}

/* Iron controls */
#cd .ctrl{display:flex;gap:6px;padding:0 8px;pointer-events:auto;align-items:center;height:58px}
#cd .ib{position:relative;width:40px;height:40px;display:grid;place-items:center;border-radius:8px;border:1.5px solid transparent;background:var(--iron) padding-box,var(--rim) border-box;
 box-shadow:0 0 0 1px #0c0704,0 3px 6px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.2),inset 0 -3px 6px rgba(0,0,0,.35);color:#f0e2c0;transition:transform .12s,filter .2s,color .2s}
#cd .ib .ic{font-size:21px;filter:drop-shadow(0 1px 1px #000)}
#cd .ib:hover{filter:brightness(1.25);color:var(--gold-hi);transform:translateY(-1px)}
#cd .ib:active{transform:translateY(1px);filter:brightness(.9)}
#cd .ib.on{color:var(--gold-hi);background:${grain(.35)} padding-box,linear-gradient(#7a5a22,#4a3412 55%,#35240b) padding-box,var(--rim) border-box}
#cd .ib .kbd{position:absolute;right:-3px;bottom:-4px;font-size:9.5px;min-width:14px;height:14px;padding:0 2px;border-radius:3px;background:#1a110a;color:var(--txt2);display:grid;place-items:center;box-shadow:0 0 0 1px #6b5022;font-family:var(--serif);font-weight:700;opacity:0;transition:opacity .2s}
#cd .ctrl:hover .kbd,#cd .bm:hover .kbd{opacity:1}
#cd .ib.speed{width:auto;min-width:54px;padding:0 8px;display:flex;gap:3px}
#cd .ib.speed b{font-size:14px;font-variant-numeric:tabular-nums}
#cd [data-tip]:hover::before{content:attr(data-tip);position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);white-space:nowrap;padding:5px 9px;border-radius:5px;background:#1a110a;color:var(--txt);font-size:12.5px;font-weight:400;font-style:normal;letter-spacing:.02em;box-shadow:0 0 0 1px #8d6420,0 6px 14px rgba(0,0,0,.6);pointer-events:none;z-index:5;animation:cdFade .18s}
#cd .res [data-tip]:hover::before{left:6px;transform:none}
#cd .ctrl [data-tip]:hover::before{left:auto;right:-6px;transform:none}

/* Hint */
#cd .hint{position:absolute;left:16px;bottom:16px;max-width:min(520px,70vw);padding:9px 16px 9px 12px;display:flex;align-items:center;gap:10px;font-size:14px;font-style:italic;color:var(--ink);pointer-events:none;transition:opacity .4s,transform .5s}
#cd .hint .ic{font-size:20px;color:#7a5520;flex:none}
#cd .hint kbd{font-family:var(--serif);font-style:normal;font-weight:700;font-size:11.5px;padding:0 5px;border-radius:3px;background:#3a2716;color:#f6e6c2;margin:0 1px;box-shadow:0 1px 0 #000}
#cd .hint:empty{display:none}
#cd.intro .hint{opacity:0;transform:translateY(20px)}
#cd .hint.swap{animation:cdHint .45s}
@keyframes cdHint{0%{opacity:.2;transform:translateY(6px)}100%{opacity:1;transform:none}}

/* Banner */
#cd .banner{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;opacity:0;white-space:nowrap}
#cd .banner.show{animation:cdBanner 3.2s cubic-bezier(.2,.8,.2,1) forwards}
#cd.has-sel .banner{visibility:hidden}   /* a build ring or tower card in use outranks the announcement */
#cd .banner .k{font-size:15px;letter-spacing:.4em;font-variant:small-caps;color:#f3dfb0;text-shadow:0 2px 6px #000}
#cd .banner .t{font-size:clamp(30px,4.4vw,54px);font-weight:700;font-variant:small-caps;letter-spacing:.06em;background:linear-gradient(#fff8dc,#f2cb6b 50%,#a8741d);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 2px 0 #3a2305) drop-shadow(0 6px 14px rgba(0,0,0,.7))}
#cd .banner.bad .t{background-image:linear-gradient(#fff0e6,#ff9d7c 45%,#a8251a)}
#cd .banner .fl{width:240px;height:24px;color:#e7bd5a;margin:6px auto 0;display:block;filter:drop-shadow(0 1px 2px #000)}
#cd .banner .s{font-size:17px;color:#fff1cf;font-style:italic;text-shadow:0 2px 6px #000,0 0 2px #000;margin-top:4px;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px}
#cd .banner .s .br{flex-basis:100%;height:0}
@keyframes cdBanner{0%{opacity:0;transform:translate(-50%,-30%) scale(.94);letter-spacing:.3em}12%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1;transform:translate(-50%,-50%)}100%{opacity:0;transform:translate(-50%,-62%)}}

/* ── Build menu (radial) ── */
#cd .bm{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
#cd .bm-ring{position:absolute;left:-44px;top:-44px;width:88px;height:88px;border-radius:50%;border:1.5px dashed rgba(255,226,150,.8);box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 0 0 1px rgba(0,0,0,.35),0 0 24px rgba(255,210,120,.25);animation:cdSpin 30s linear infinite}
#cd .bm.open .bm-ring{animation:cdRingIn .35s cubic-bezier(.2,1.4,.4,1),cdSpin 30s linear infinite}
@keyframes cdSpin{to{transform:rotate(360deg)}}
@keyframes cdRingIn{0%{transform:scale(.3);opacity:0}100%{transform:scale(1);opacity:1}}
#cd .bm-opt{position:absolute;left:0;top:0;width:66px;height:66px;margin:-33px 0 0 -33px;pointer-events:auto;border-radius:50%;transition:transform .12s,filter .2s;animation:cdPop .36s cubic-bezier(.2,1.5,.4,1) backwards}
#cd .bm-opt .med{position:absolute;inset:0;border-radius:50%;border:2px solid transparent;background:radial-gradient(circle at 50% 35%,#5a4430,#2a1c11 70%) padding-box,var(--rim) border-box;
 box-shadow:0 0 0 1.5px #0c0704,0 8px 16px -4px rgba(0,0,0,.8),inset 0 2px 0 rgba(255,230,170,.25),inset 0 -8px 14px rgba(0,0,0,.5);display:grid;place-items:center}
#cd .bm-opt .med .ic{font-size:38px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.7))}
#cd .bm-opt .cost{position:absolute;left:50%;bottom:-11px;transform:translateX(-50%);display:flex;align-items:center;gap:3px;padding:1px 7px 1px 3px;border-radius:9px;background:linear-gradient(#2d1f12,#170e07);box-shadow:0 0 0 1px #c9a24e,0 2px 4px rgba(0,0,0,.6);font-size:13px;font-weight:700;color:var(--gold-hi);white-space:nowrap}
#cd .bm-opt .cost .ic{font-size:14px}
#cd .deny{animation:cdPoor .45s ease-in-out}
#cd .bm-opt.deny .cost b{color:#ff6a50}
#cd .bm-opt .kbd{position:absolute;left:-2px;top:-2px;width:17px;height:17px;border-radius:50%;font-size:10.5px;font-weight:700;display:grid;place-items:center;background:#1a110a;color:var(--gold-hi);box-shadow:0 0 0 1px #c9a24e;opacity:.85}
#cd .bm-opt:hover,#cd .bm-opt.hot{transform:scale(1.1);filter:brightness(1.12)}
#cd .bm-opt:hover .med,#cd .bm-opt.hot .med{box-shadow:0 0 0 1.5px #0c0704,0 0 18px 2px rgba(255,205,100,.55),inset 0 2px 0 rgba(255,230,170,.3),inset 0 -8px 14px rgba(0,0,0,.4)}
#cd .bm-opt:active{transform:scale(1.02)}
#cd .bm-opt.poor .med .ic{filter:grayscale(1) brightness(.55)}
#cd .bm-opt.poor .med{background:radial-gradient(circle at 50% 35%,#3b342e,#1c1814 70%) padding-box,linear-gradient(#8b857a,#4b4640) border-box}
#cd .bm-opt.poor .cost{color:#ff8f7a;box-shadow:0 0 0 1px #7a3a2c}
@keyframes cdPop{0%{transform:translate(var(--fx),var(--fy)) scale(.2);opacity:0}100%{opacity:1}}

/* Info cards (build tooltip + tower panel) */
#cd .card{position:absolute;left:0;top:0;width:290px;pointer-events:auto;padding:0;overflow:visible;animation:cdCard .28s cubic-bezier(.2,.9,.3,1)}
@keyframes cdCard{0%{opacity:0;transform:translateY(8px)}}
#cd .card-h{display:flex;align-items:center;gap:11px;padding:10px 12px 9px;border-radius:6px 6px 0 0;background:var(--leather);color:var(--txt);box-shadow:inset 0 -1px 0 #c9a24e,inset 0 -2px 0 #3b2a10}
#cd .card-h .med{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:none;border:1.5px solid transparent;background:radial-gradient(circle at 50% 35%,#5a4430,#23170d 70%) padding-box,var(--rim) border-box;box-shadow:0 2px 5px rgba(0,0,0,.6)}
#cd .card-h .med .ic{font-size:30px}
#cd .card-h .nm{font-size:19px;font-weight:700;font-variant:small-caps;letter-spacing:.06em;color:var(--gold-hi);text-shadow:0 1px 0 #000;line-height:1.1}
#cd .card-h .dt{font-size:12px;color:var(--txt2);display:flex;align-items:center;gap:5px;margin-top:2px;font-variant:small-caps;letter-spacing:.1em}
#cd .card-h .dt .ic{font-size:13px}
#cd .dt.pierce .ic{color:#e6d6b4}#cd .dt.blast .ic{color:#ff9d5c}#cd .dt.magic .ic{color:#c7a4ff}#cd .dt.fire .ic{color:#ff8a3a}
#cd .card-h .x{margin-left:auto;align-self:flex-start;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;color:var(--txt2)}
#cd .card-h .x:hover{color:var(--gold-hi);background:rgba(255,255,255,.08)}
#cd .card-b{padding:10px 14px 12px}
#cd .desc{font-size:13.5px;font-style:italic;color:var(--ink2);margin:0 0 9px;line-height:1.35}
#cd .stats{display:grid;grid-template-columns:auto 1fr auto;gap:5px 8px;align-items:center;font-size:14px}
#cd .stats .ic{font-size:16px;color:#6d4a22}
#cd .stats span{color:var(--ink2);font-variant:small-caps;letter-spacing:.06em}
#cd .stats b{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
#cd .stats b em{font-style:normal;color:#3d7a1f;font-size:12.5px;margin-left:5px}
#cd .rule{height:1px;margin:10px -4px;background:linear-gradient(90deg,transparent,rgba(110,70,20,.55),transparent)}
#cd .pips{display:flex;gap:5px;margin-top:4px}
#cd .pips i{width:10px;height:10px;transform:rotate(45deg);background:#20150c;box-shadow:inset 0 0 0 1px #8d6420}
#cd .pips i.on{background:linear-gradient(135deg,#fff4c2,#e7bd5a 50%,#8d6420);box-shadow:0 0 0 1px #2a1a0c,0 0 6px rgba(255,210,110,.6)}
#cd .kills{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink2)}
#cd .kills .ic{font-size:17px;color:#4a3320}
#cd .kills b{color:var(--ink)}
#cd .acts{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:8px;margin-top:12px}
#cd .acts .btn{white-space:nowrap;min-width:0}
#cd .acts.solo{grid-template-columns:1fr}
#cd .btn{flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 10px;border-radius:7px;border:1.5px solid transparent;font-size:15px;font-weight:700;font-variant:small-caps;letter-spacing:.07em;color:#fff5dc;text-shadow:0 1px 0 rgba(0,0,0,.7);
 background:${grain(.3)} padding-box,linear-gradient(#4f7a2c,#2f5317 60%,#223f10) padding-box,var(--rim) border-box;box-shadow:0 0 0 1px #0c0704,0 4px 8px -2px rgba(0,0,0,.6),inset 0 1px 0 rgba(220,255,180,.35);transition:transform .12s,filter .2s}
#cd .btn .ic{font-size:17px}
#cd .btn .c{display:flex;align-items:center;gap:3px;font-variant:normal;letter-spacing:0;color:var(--gold-hi)}
#cd .btn:hover{filter:brightness(1.15)}
#cd .btn:active{transform:translateY(1px)}
#cd .btn.sell{flex:.8;background:${grain(.3)} padding-box,linear-gradient(#5b564e,#3a3630 55%,#26221e) padding-box,var(--rim) border-box}
#cd .btn.sell.armed{background:linear-gradient(#a8301f,#6d130d) padding-box,var(--rim) border-box}
#cd .btn[disabled]{filter:grayscale(.9) brightness(.7);cursor:default}
#cd .btn .kbd{position:absolute;right:4px;top:3px;font-size:9px;opacity:.6;font-variant:normal}
#cd .card .need{font-size:12.5px;color:#9a2a1c;font-style:italic;margin-top:7px;text-align:center}
#cd .card .costline{display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:14px;color:var(--ink2);font-variant:small-caps;letter-spacing:.06em}
#cd .card .costline b{display:flex;align-items:center;gap:4px;font-size:17px;color:var(--ink);font-variant:normal}
#cd .card .costline b.poor{color:#a3261a}
#cd .card .costline .ic{font-size:18px}

/* Paused */
#cd .paused{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 34px;font-size:30px;font-weight:700;font-variant:small-caps;letter-spacing:.3em;color:var(--gold-hi);display:none;text-shadow:0 2px 0 #000}
#cd .paused{text-align:center;padding:16px 26px 18px;width:max-content}
#cd .pbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:8px;padding:9px 18px;border-radius:7px;font-size:16px;letter-spacing:.08em;color:var(--txt);background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 1px rgba(231,189,90,.35);text-shadow:none}
#cd .pbtn:first-of-type{margin-top:12px;color:var(--gold-hi);box-shadow:inset 0 0 0 1px rgba(231,189,90,.8)}
#cd .pbtn:hover{background:rgba(231,189,90,.16)}
#cd .pbtn.armed{background:linear-gradient(#a8301f,#6d130d);color:#fff4d8}
#cd .pbtn .kbd{margin-left:4px;font-size:11px;padding:0 5px;border-radius:3px;background:#1a110a;color:var(--txt2);box-shadow:0 0 0 1px #6b5022;font-variant:normal;letter-spacing:0}
#cd.is-paused.has-sel .paused{display:none}
#cd.is-paused .paused{display:block;animation:cdFade .25s}
#cd .veil{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(20,12,6,.0) 40%,rgba(20,12,6,.45));opacity:0;transition:opacity .4s}
#cd.is-paused .veil{opacity:1;background:rgba(18,11,5,.35)}
@keyframes cdFade{from{opacity:0}}

/* ── Full screens ── */
#cd .screen{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;text-align:center;padding:24px}
#cd .screen.on{display:flex;animation:cdFade .9s ease}
#cd .screen.title{background:radial-gradient(ellipse 80% 70% at 50% 45%,rgba(15,9,4,.05),rgba(15,9,4,.62) 100%),linear-gradient(rgba(15,9,4,.5),rgba(15,9,4,0) 30%,rgba(15,9,4,0) 60%,rgba(15,9,4,.75))}
@media (min-width:761px){
 #cd .screen.title{align-items:flex-start;text-align:left;padding:24px 24px 24px max(48px,6.5vw);background:linear-gradient(90deg,rgba(12,7,3,.86) 0%,rgba(12,7,3,.6) 30%,rgba(12,7,3,.15) 52%,rgba(12,7,3,0) 64%),linear-gradient(rgba(12,7,3,.35),rgba(12,7,3,0) 25%,rgba(12,7,3,0) 70%,rgba(12,7,3,.6))}
 #cd .screen.title .fl{margin:16px 0}
 #cd .screen.title .diff{justify-content:flex-start}
 #cd .screen.title .crest{padding-left:.2em}
 #cd .screen.title .how{max-width:620px}
}
#cd .screen.title.out{animation:cdOut .8s ease forwards}
@keyframes cdOut{to{opacity:0;transform:scale(1.04)}}
#cd .crest{font-size:15px;letter-spacing:.55em;font-variant:small-caps;color:#f3dfb0;text-shadow:0 2px 8px #000;padding-left:.55em}
#cd .gtitle{margin:2px 0 0;font-size:clamp(52px,9.5vw,124px);line-height:.95;font-weight:700;font-variant:small-caps;letter-spacing:.04em;background:linear-gradient(176deg,#fffbe6 8%,#f7dc8e 38%,#d59b34 58%,#8a5a16 76%,#e8c068 92%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 2px 0 #2a1703) drop-shadow(0 3px 0 #120902) drop-shadow(0 12px 22px rgba(0,0,0,.75))}
#cd .gsub{font-size:clamp(16px,2vw,22px);font-style:italic;color:#fbeed0;text-shadow:0 2px 8px #000,0 0 2px #000;margin-top:8px}
#cd .fl{display:block;width:min(300px,70vw);height:30px;color:var(--gold);margin:14px auto;filter:drop-shadow(0 1px 1px #000)}
#cd .maps{display:flex;gap:10px;justify-content:center;margin:2px 0 6px;flex-wrap:wrap}
#cd .mapbtn{display:flex;align-items:center;gap:9px;padding:8px 16px 8px 11px;text-align:left;opacity:.72;filter:saturate(.6);transition:opacity .2s,filter .2s,transform .2s}
#cd .mapbtn .ic{font-size:28px;color:#c7ad85;filter:drop-shadow(0 2px 3px #000)}
#cd .mapbtn b{display:block;font-size:17px;font-variant:small-caps;letter-spacing:.08em;color:var(--gold-hi)}
#cd .mapbtn small{display:block;font-size:11.5px;font-style:italic;color:var(--txt2)}
#cd .mapbtn:hover{opacity:1;filter:none;transform:translateY(-2px)}
#cd .mapbtn.sel{opacity:1;filter:none;box-shadow:0 0 0 1px #0c0704,0 0 0 3px rgba(255,214,120,.3),0 0 22px rgba(255,190,80,.3),inset 0 0 14px rgba(0,0,0,.5)}
#cd .mapbtn.sel .ic{color:var(--gold-hi)}
#cd .mapbtn{position:relative}
#cd .mapbtn .best{position:absolute;right:6px;top:-9px;display:flex;gap:1px;font-size:13px;filter:drop-shadow(0 1px 2px #000)}
#cd .mapbtn .best .ic{font-size:13px;color:var(--gold)}
#cd .stars{display:flex;justify-content:center;gap:10px;margin:10px 0 0}
#cd .stars i{font-size:40px;color:rgba(110,70,20,.25);filter:grayscale(1);animation:cdStar .5s cubic-bezier(.3,1.6,.4,1) backwards}
#cd .stars i.on{color:inherit;filter:drop-shadow(0 2px 3px rgba(80,40,0,.5))}
#cd .stars i .ic{font-size:40px}
@keyframes cdStar{0%{transform:scale(0) rotate(-30deg);opacity:0}100%{transform:none;opacity:1}}
#cd .link:focus-visible{outline:2px solid var(--ink2);outline-offset:3px}
#cd .diff{display:flex;gap:14px;margin:12px 0 22px;flex-wrap:wrap;justify-content:center}
#cd .dcard{width:172px;padding:14px 12px 12px;text-align:center;opacity:.8;transition:transform .2s,opacity .2s,filter .2s;filter:saturate(.7)}
#cd .dcard .ic{font-size:36px;color:#c7ad85;filter:drop-shadow(0 2px 3px #000)}
#cd .dcard h3{margin:4px 0 3px;font-size:20px;font-variant:small-caps;letter-spacing:.1em;color:var(--gold-hi)}
#cd .dcard p{margin:0;font-size:12.5px;color:var(--txt2);font-style:italic;line-height:1.3}
#cd .dcard .m{margin-top:8px;display:flex;justify-content:center;gap:10px;font-size:13px;color:var(--txt);font-variant-numeric:tabular-nums}
#cd .dcard .m span{display:flex;align-items:center;gap:3px}
#cd .dcard .m .ic{font-size:15px}
#cd .dcard:hover{opacity:1;transform:translateY(-3px);filter:none}
#cd .dcard.sel{opacity:1;filter:none;transform:translateY(-4px);box-shadow:0 0 0 1px #0c0704,0 0 0 4px rgba(255,214,120,.25),0 0 30px rgba(255,190,80,.35),0 14px 30px -8px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,226,160,.3),inset 0 0 16px rgba(0,0,0,.5)}
#cd .dcard.sel .ic{color:var(--gold-hi)}
#cd .cta{position:relative;padding:15px 46px 14px;font-size:24px;font-weight:700;font-variant:small-caps;letter-spacing:.14em;color:#fff4d8;border-radius:10px;border:2px solid transparent;text-shadow:0 2px 0 #3a0703,0 0 14px rgba(255,170,90,.45);
 background:${grain(.3)} padding-box,linear-gradient(#be3a28,#831c11 55%,#5a0f09) padding-box,var(--rim) border-box;box-shadow:0 0 0 1px #140604,0 16px 32px -10px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,210,170,.5),inset 0 -10px 18px rgba(0,0,0,.3);transition:transform .15s,filter .2s}
#cd .cta:hover{filter:brightness(1.15);transform:translateY(-2px)}
#cd .cta:active{transform:translateY(1px)}
#cd .cta::after{content:"";position:absolute;inset:-2px;border-radius:inherit;animation:cdPulse 2.2s infinite;pointer-events:none}
#cd .how{margin-top:20px;font-size:14.5px;color:#f1e3c2;text-shadow:0 1px 4px #000,0 0 2px #000;max-width:640px;line-height:1.5}
#cd .how kbd{font-family:var(--serif);font-weight:700;font-size:12px;padding:1px 6px;border-radius:3px;background:rgba(20,12,6,.8);box-shadow:0 0 0 1px #8d6420;color:var(--gold-hi)}
#cd .screen.title > *{animation:cdRise 1s cubic-bezier(.2,.8,.2,1) backwards}
#cd .screen.title > :nth-child(2){animation-delay:.12s}#cd .screen.title > :nth-child(3){animation-delay:.24s}#cd .screen.title > :nth-child(4){animation-delay:.36s}#cd .screen.title > :nth-child(5){animation-delay:.48s}#cd .screen.title > :nth-child(6){animation-delay:.6s}#cd .screen.title > :nth-child(7){animation-delay:.72s}
@keyframes cdRise{0%{opacity:0;transform:translateY(18px)}100%{opacity:1;transform:none}}

#cd .screen.end{background:radial-gradient(ellipse at center,rgba(20,12,4,.35),rgba(10,6,2,.85))}
#cd .screen.end.lost{background:radial-gradient(ellipse at center,rgba(40,6,2,.4),rgba(14,2,0,.9))}
#cd .end-card{width:min(520px,92vw);padding:0 0 22px;animation:cdRise .9s .2s cubic-bezier(.2,.8,.2,1) backwards}
#cd .end-top{margin-top:-46px;display:flex;justify-content:center}
#cd .end-top .medal{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;border:2.5px solid transparent;background:radial-gradient(circle at 50% 35%,#5a4430,#1c120a 72%) padding-box,var(--rim) border-box;box-shadow:0 0 0 1.5px #0c0704,0 10px 24px rgba(0,0,0,.7),0 0 40px rgba(255,200,90,.35)}
#cd .end-top .medal .ic{font-size:58px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.7))}
#cd .lost .end-top .medal{box-shadow:0 0 0 1.5px #0c0704,0 10px 24px rgba(0,0,0,.7),0 0 40px rgba(255,60,30,.35)}
#cd .lost .end-top .medal .ic{color:#e8dcc4}
#cd .end-card h2{margin:12px 16px 0;font-size:clamp(34px,6vw,58px);font-variant:small-caps;letter-spacing:.08em;line-height:1;background:linear-gradient(#5a3a12,#2a1604);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 1px 0 rgba(255,240,200,.8))}
#cd .lost .end-card h2{background:linear-gradient(#8d1a12,#420804);-webkit-background-clip:text;background-clip:text}
#cd .end-card .fl{color:#8d6420;filter:none;margin:10px auto}
#cd .end-card .lead{margin:0 32px;font-size:16px;font-style:italic;color:var(--ink2)}
#cd .ledger{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 28px 20px}
#cd .ledger div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:6px;background:rgba(90,55,20,.1);box-shadow:inset 0 0 0 1px rgba(110,70,20,.3),inset 0 1px 3px rgba(80,40,10,.25)}
#cd .ledger .ic{font-size:22px;color:#6d4a22}
#cd .ledger b{font-size:28px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1}
#cd .ledger span{font-size:12.5px;font-variant:small-caps;letter-spacing:.12em;color:var(--ink2)}
#cd .end-card .cta{font-size:20px;padding:12px 38px}
#cd .link{display:block;margin:14px auto 0;font-size:13.5px;color:var(--ink2);text-decoration:underline;text-decoration-color:rgba(91,63,34,.4);text-underline-offset:3px}
#cd .link:hover{color:var(--ink);text-decoration-color:currentColor}

/* Lane entry pins (build phase): how many foes take each road. */
#cd .pin{position:absolute;left:0;top:0;display:flex;align-items:center;gap:6px;padding:3px 10px 3px 4px;margin:-40px 0 0;translate:-50% 0;border-radius:14px;white-space:nowrap;
 background:linear-gradient(#3a2818,#23170d);box-shadow:inset 0 0 0 1px rgba(231,189,90,.6),0 3px 8px rgba(0,0,0,.55);font-size:13px;font-style:italic;text-transform:capitalize;color:var(--txt);animation:cdFade .4s}
#cd .pin b{min-width:22px;height:22px;padding:0 5px;border-radius:11px;display:grid;place-items:center;background:var(--red);color:#fff4d8;font-style:normal;font-size:13px;box-shadow:inset 0 0 0 1px #f0a080}
#cd .pin::after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-bottom:0;border-top-color:#23170d}
#cd .pin[hidden]{display:none}
#cd.fighting .pin{opacity:.5}   /* in battle the label steps back so the foes beneath it show */
#cd .breach{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 52%,rgba(150,16,8,.55) 100%)}
#cd .breach.on{animation:cdBreach .9s ease-out}
@keyframes cdBreach{0%{opacity:0}12%{opacity:1}100%{opacity:0}}

/* Mid widths (small laptops, landscape tablets): the herald drops to its own centred row instead of colliding. */
@media (min-width:761px) and (max-width:1100px){#cd .top{flex-wrap:wrap;row-gap:8px}#cd .herald{order:3;flex-basis:100%;justify-content:center}}

/* ── Compact / portrait ── */
@media (max-width:760px){
 #cd{font-size:14px}
 #cd .top{flex-wrap:wrap;padding:calc(env(safe-area-inset-top) + 8px) 8px 0;gap:8px}
 #cd .res{height:44px;padding:0 2px;order:1;flex:1 1 auto;justify-content:space-around;min-width:0}
 #cd .stat{padding:0 4px;gap:5px}
 #cd .stat .ic{font-size:21px}
 #cd .stat b{font-size:19px}
 #cd .stat small{font-size:12px;margin-bottom:12px}
 #cd .stat .lbl{display:none}
 #cd .ctrl{order:2;height:44px;padding:4px;gap:4px}
 #cd .ib{width:32px;height:32px}
 #cd .ib .ic{font-size:18px}
 #cd .ib.speed{min-width:34px;padding:0 4px}
 #cd .ib.speed b{display:none}
 #cd .herald{order:3;width:100%}
 #cd .preview{flex:1;min-width:0;padding:5px 10px 8px 12px;height:auto;min-height:54px}
 #cd .pv-k{display:none}
 #cd .en{padding:0 5px 0 2px}
 #cd .pv-name{font-size:14px}
 #cd .pv-list{gap:4px;flex-wrap:wrap}
 #cd .en{height:23px}
 #cd .en .ic{font-size:18px}
 #cd .horn{min-width:104px;padding:5px 10px}
 #cd .horn .row{font-size:14px;gap:5px}
 #cd .horn .row .ic{font-size:22px}
 #cd [data-tip]:hover::before{display:none}
 #cd .hint{left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 8px);max-width:none;font-size:13px}
 #cd .card{width:auto;left:8px!important;right:8px;top:auto!important;bottom:calc(env(safe-area-inset-bottom) + 8px);animation:cdSheet .3s cubic-bezier(.2,.9,.3,1)}
 #cd .bm-opt{width:62px;height:62px;margin:-31px 0 0 -31px}
 #cd .dcard{width:31%;min-width:104px;padding:10px 6px}
 #cd .maps{flex-wrap:nowrap;gap:6px;width:100%}
 #cd .mapbtn{flex:1;min-width:0;flex-direction:column;gap:3px;padding:7px 4px;text-align:center}
 #cd .mapbtn .ic{font-size:22px}
 #cd .mapbtn b{font-size:14px;letter-spacing:.04em}
 #cd .mapbtn small{display:none}
 #cd .crest{letter-spacing:.22em}
 #cd .dcard p{display:none}
 #cd .dcard h3{font-size:17px}
 #cd .dcard .m{flex-wrap:wrap;gap:2px 7px;font-size:12px}
 #cd .screen.title{justify-content:flex-end;padding-bottom:calc(env(safe-area-inset-bottom) + 28px);background:linear-gradient(rgba(12,7,3,0) 25%,rgba(12,7,3,.55) 50%,rgba(12,7,3,.85))}
 #cd .gtitle{font-size:64px}
 #cd .diff{gap:8px}
 #cd .how{font-size:13px}
 #cd .how .desk{display:none}
 #cd .banner{top:30%}
 #cd .ledger{margin:14px 16px 16px}
}
@keyframes cdSheet{0%{transform:translateY(40px);opacity:0}}
/* Landscape phones: the card docks to the right edge so the radial menu keeps the rest of the screen. */
@media (max-width:760px) and (orientation:landscape){#cd .card{left:auto!important;right:8px;top:8px!important;bottom:auto;max-height:calc(100% - 16px);width:270px;overflow:auto}#cd .card .desc{display:none}}
/* Touch: at least 44 px to hit, whatever the drawn size. */
@media (pointer:coarse){#cd .ctrl{gap:1px;padding:0 2px;height:auto}#cd .ctrl .ib{width:44px;height:44px}#cd .card-h .x{position:relative}#cd .card-h .x::after{content:"";position:absolute;inset:-9px}#cd .pbtn{min-height:46px}#cd .end-card .link{padding:14px 10px}}
@media (hover:none){#cd .kbd,#cd .how .desk{display:none!important}}
@media (prefers-reduced-motion:reduce){#cd *,#cd *::before,#cd *::after{animation:none!important;transition:none!important}#cd .banner.show{opacity:1}}
`;
