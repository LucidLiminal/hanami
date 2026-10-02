import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";
const base = process.env.HANAMI_TEST_URL || "http://127.0.0.1:4174";
const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pins = new Map();
const writes = [];
const publicActivity = [];
let failWrites = false;
let denyReads = false;
const tracks = [
  { title: "Breathe", artist: "The Prodigy", provider: "soundcloud", soundcloudId: "123456", permalinkUrl: "https://soundcloud.com/fixture/breathe", artwork: "https://i1.sndcdn.com/v137-art-0.jpg", duration: 334 },
  { title: "Second Reader", artist: "Hanami", provider: "soundcloud", soundcloudId: "654321", permalinkUrl: "https://soundcloud.com/fixture/second-reader", artwork: "https://i1.sndcdn.com/v137-art-1.jpg", duration: 185 },
  { title: "Third Reader", artist: "Hanami", provider: "soundcloud", soundcloudId: "333333", permalinkUrl: "https://soundcloud.com/fixture/third-reader", artwork: "https://i1.sndcdn.com/v137-art-1.jpg", duration: 185 },
];
const image = await sharp(new URL("../public/assets/nazuna.webp", import.meta.url).pathname).resize(390,1100,{fit:"cover"}).png().toBuffer();
const art = [
  await readFile(new URL("fixtures/player-reference-album-v137.jpg",import.meta.url)),
  await sharp(new URL("../public/assets/nightcar.webp",import.meta.url).pathname).resize(512,512,{fit:"cover"}).jpeg().toBuffer(),
];
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || "/usr/local/bin/chromium", headless:true, args:["--no-sandbox"] });
const errors = [];
const json = (route,data,status=200) => route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
async function setup(user) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:"block",acceptDownloads:true});
  await context.addInitScript({content:await readFile(new URL("fixtures/soundcloud-widget-v137.js",import.meta.url),"utf8")});
  await context.addInitScript(({user})=>{
    const id=localStorage.getItem("v137-test-user") || user;
    localStorage.setItem("hanami-supabase-session-v1",JSON.stringify({access_token:`fixture-${id}`,expires_at:Math.floor(Date.now()/1000)+3600,user:{id,is_anonymous:true,user_metadata:{display_name:id.endsWith("1")?"Owner":"Member"}}}));
    localStorage.setItem("hanami-installed-sources",JSON.stringify(["fixture.source"]));
    localStorage.setItem("hanami-library",JSON.stringify([{id:"fixture-book",title:"Lectura v137",url:"/fixture/book",sourceId:"fixture.source",favorite:true,categories:["default"],_chapters:[{url:"/fixture/chapter/1",number:1,name:"Capítulo 1"}]}]));
    window.__V137_SHARES__=[];
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:async(data)=>{
      window.__V137_SHARES__.push({url:data.url,title:data.title,fileName:data.files?.[0]?.name,fileSize:data.files?.[0]?.size});
    }});
  },{user});
  await context.route("https://w.soundcloud.com/player/**",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Widget fixture</title>"}));
  await context.route("https://soundcloud.com/**",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Source fixture</title>"}));
  await context.route("**/v137-page-*.png",route=>route.fulfill({contentType:"image/png",body:image}));
  await context.route("https://i1.sndcdn.com/v137-art-*.jpg",route=>route.fulfill({contentType:"image/jpeg",body:art[Number(route.request().url().match(/art-(\d)/)?.[1]||0)]}));
  await context.route("**/api/music/capabilities",route=>json(route,{soundcloud:{widget:true,oembed:true,searchConfigured:false}}));
  await context.route("**/api/source/fixture.source/**",route=>{
    if(new URL(route.request().url()).pathname.endsWith("/pages")) return json(route,[0,1,2].map(i=>({imageUrl:`/v137-page-${i}.png`})));
    if(new URL(route.request().url()).pathname.endsWith("/chapters")) return json(route,[{url:"/fixture/chapter/1",number:1,name:"Capítulo 1"}]);
    return json(route,{title:"Lectura v137",url:"/fixture/book"});
  });
  await context.route("**/api/music/lyrics?**",route=>json(route,{provider:"LRCLIB",lyrics:"[00:00.00]Breathe with the page\n[00:02.00]The story continues\n[00:08.00]One more chapter",synced:true}));
  await context.route("**/api/social-config",route=>json(route,{enabled:true,url:"https://v137.supabase.test",anonKey:"fixture-public-anon"}));
  await context.route("https://v137.supabase.test/**",route=>{
    const url=new URL(route.request().url());
    const actor=(route.request().headers().authorization||"").replace("Bearer fixture-","");
    if(url.pathname.endsWith("/auth/v1/user")) return json(route,{id:actor,is_anonymous:true,user_metadata:{display_name:"Fixture reader"}});
    if(url.pathname.endsWith("/auth/v1/logout")) return json(route,{});
    if(url.pathname.endsWith("/rpc/list_my_reading_groups")) return json(route,[{id:group,name:"Lectura compartida",owner_id:owner,members:[{id:owner,role:"owner",state:"active"},{id:member,role:"member",state:"active"}],member_count:2}]);
    if(url.pathname.endsWith("/rpc/list_reader_music_trends")) return json(route,[]);
    if(url.pathname.endsWith("/rpc/record_reader_music_activity")) {publicActivity.push(route.request().postDataJSON());return json(route,{accepted:true});}
    if(url.pathname.endsWith("/rpc/upsert_group_reader_music_pin")) {
      if(failWrites) return route.abort("internetdisconnected");
      const body=route.request().postDataJSON(); writes.push({actor,body});
      const previous=pins.get(body.p_pin_id);
      if(previous && previous.author_id!==actor) return json(route,{code:"42501",message:"Another author"},403);
      if(previous && body.p_revision<=previous.revision) return json(route,previous);
      const row={id:body.p_pin_id,group_id:body.p_group,author_id:actor,page_key:body.p_page_key,x:body.p_x,y:body.p_y,track:{...body.p_track,provider:"soundcloud",permalinkUrl:body.p_track.url},revision:body.p_revision,created_at:previous?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null};
      pins.set(row.id,row); return json(route,row);
    }
    if(url.pathname.endsWith("/rpc/list_group_reader_music_pins")) {
      if(denyReads) return json(route,{code:"42501",message:"Not a member"},403);
      const body=route.request().postDataJSON();
      return json(route,[...pins.values()].filter(pin=>!pin.deleted_at && pin.group_id===body.p_group && body.p_page_keys.includes(pin.page_key)));
    }
    if(url.pathname.endsWith("/rpc/delete_group_reader_music_pin")) {
      const body=route.request().postDataJSON(); const pin=pins.get(body.p_pin_id);
      if(pin) {pin.deleted_at=new Date().toISOString();pin.revision=Math.max(pin.revision+1,body.p_revision);}
      return json(route,pin||null);
    }
    return json(route,[]);
  });
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(()=>!!window.HanamiReaderMusic&&!!window.HanamiReaderMusicServices&&!!window.HanamiMusicDiscovery);
  await page.evaluate(async(group)=>{
    await window.HanamiReaderMusic.ready; await window.HanamiSocialSync.ready;
    window.HanamiReadingGroups.setActive(group);
    window.HanamiReader.open({title:"Lectura v137",sourceId:"fixture.source",mangaId:"fixture-book",mangaUrl:"/fixture/book",chapter:{url:"/fixture/chapter/1",number:1,name:"Capítulo 1"},pages:[0,1,2].map(i=>({imageUrl:`/v137-page-${i}.png`}))});
    // Wait for the reader's delayed restore before testing marker scrolling.
    await new Promise(resolve=>addEventListener("hanami-reader-progress",resolve,{once:true}));
  },group);
  await page.waitForFunction(()=>[...document.querySelectorAll("#readerViewport img")].every(img=>img.complete&&img.naturalWidth>0));
  return {context,page};
}
async function proof(page,name) {
  await page.evaluate(()=>window.HanamiSnackbar?.clear?.());
  const html=await page.evaluate(async()=>{
    const source=document.documentElement.cloneNode(true);
    source.querySelectorAll("script,iframe").forEach(node=>node.remove());
    const links=[...source.querySelectorAll('link[rel="stylesheet"]')];
    for(const link of links) {
      const style=document.createElement("style");style.textContent=await fetch(link.href).then(r=>r.text());link.replaceWith(style);
    }
    source.querySelectorAll("input").forEach((copy,index)=>{
      const original=document.querySelectorAll("input")[index];
      copy.setAttribute("value",original.value);
      if(original.checked) copy.setAttribute("checked","");else copy.removeAttribute("checked");
    });
    // Scrollable child sheets retain their actual selected state.
    document.querySelectorAll(".player-tool-sheet,#readerSheet,.reader-music-picker,#readerViewport").forEach(node=>{
      const selector=node.id?`#${node.id}`:node.classList.contains("player-tool-sheet")?".player-tool-sheet":".reader-music-picker";
      const copy=source.querySelector(selector); if(copy) {copy.dataset.qaScrollTop=node.scrollTop;copy.dataset.qaScrollLeft=node.scrollLeft;}
    });
    const embeddedArtwork=new Map();
    for(const img of source.querySelectorAll("img")) {
      if(!img.getAttribute("src")) continue;
      try {const originalUrl=img.src;const blob=await fetch(originalUrl).then(r=>r.blob());img.src=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});embeddedArtwork.set(originalUrl,img.src);} catch {}
    }
    source.querySelectorAll("[style]").forEach(node=>{let style=node.getAttribute("style");for(const [url,data] of embeddedArtwork) style=style.split(url).join(data);node.setAttribute("style",style);});
    const baseTag=document.createElement("base");baseTag.href=location.origin+"/";source.querySelector("head").prepend(baseTag);
    return "<!doctype html>"+source.outerHTML.replace("</body>",'<script>addEventListener("load",()=>document.querySelectorAll("[data-qa-scroll-top]").forEach(n=>{n.scrollTop=Number(n.dataset.qaScrollTop);n.scrollLeft=Number(n.dataset.qaScrollLeft)}))</script></body>');
  });
  await writeFile(`/data/hanami-v137-${name}.html`,html);
  await page.screenshot({path:`/data/hanami-v137-${name}.png`});
}
const currentUrl = page=>page.evaluate(()=>{const s=window.HanamiReaderMusic.snapshot();return s.tracks.find(t=>t.id===s.current)?.permalinkUrl||"";});
async function waitTrack(page,url,playing=true) {
  try {
    await page.waitForFunction(({url,playing})=>{const s=window.HanamiReaderMusic.snapshot();return s.tracks.find(t=>t.id===s.current)?.permalinkUrl===url && s.playing===playing;},{url,playing},{timeout:15000});
  } catch(error) {
    console.error("Playback diagnostic",JSON.stringify(await page.evaluate(()=>{
      const s=window.HanamiReaderMusic.snapshot();
      return {current:s.current,queue:s.queue,queueVisited:s.queueVisited,readingMode:s.readingMode,playing:s.playing,waitingForPin:s.waitingForPin,queueFinished:s.queueFinished,status:document.querySelector("[data-music-status]")?.textContent,external:s.external?.soundcloud,screen:window.HanamiScreens.current()?.type};
    })));
    throw error;
  }
}
async function finish(page) {await page.evaluate(()=>window.__SC_V137_FINISH__());}
try {
  const first=await setup(owner), page=first.page;
  await page.locator("[data-r-settings]").click();
  await page.waitForFunction(()=>window.HanamiOverlays.current()?.id==="readerSheet");
  await page.evaluate(()=>window.HanamiReaderMusic.open());
  await page.waitForFunction(()=>window.HanamiScreens.is("reader-music")&&window.HanamiOverlays.count()===0);
  assert.equal(await page.evaluate(()=>history.state?.hanamiOverlay),undefined,"full player must not inherit a settings overlay entry");
  await proof(page,"player-empty-mobile");
  assert(await page.locator(".player-footer").evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight+1),"empty-player footer remains visible");
  await page.locator("[data-music-close]").click();await page.waitForFunction(()=>window.HanamiScreens.is("reader"));
  const ids=await page.evaluate(async(tracks)=>{const ids=[];for(const track of tracks) ids.push((await window.HanamiReaderMusic.addUrl(track.permalinkUrl,track)).id);await window.HanamiReaderMusic.play(ids[0]);window.HanamiReaderMusic.open();return ids;},tracks);
  await page.locator(".player-screen").waitFor();
  await page.evaluate(()=>window.HanamiReaderMusic.seek(3));
  await proof(page,"player-mobile");
  await page.setViewportSize({width:320,height:640});
  assert(await page.locator(".player-footer").evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight+1),"compact player keeps its footer visible");
  assert(await page.locator(".player-screen").evaluate(node=>node.scrollWidth<=innerWidth),"compact player has no horizontal overflow");
  await proof(page,"player-narrow-mobile");
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator(".player-screen > .reader-music-services").count(),0);
  assert.equal(await page.locator(".player-screen > .reader-music-library").count(),0);
  const dimensions=await page.evaluate(()=>({width:document.querySelector(".player-screen").scrollWidth,height:document.querySelector("#readerSheet").scrollHeight,viewportWidth:innerWidth,viewportHeight:innerHeight}));
  assert.equal(dimensions.width,dimensions.viewportWidth);assert(dimensions.height<=dimensions.viewportHeight+1);
  await page.locator("[data-player-favorite]").click();assert.equal(await page.locator("[data-player-favorite]").getAttribute("aria-pressed"),"true");
  await page.locator('[data-player-tool="playlists"]').click();await page.locator("#playerPlaylistName").fill("Lectura nocturna");await page.locator("[data-player-create-list] button").click();
  assert.equal((await page.evaluate(()=>window.HanamiReaderPlayer.snapshot())).playlists[0].trackIds[0],ids[0]);
  await proof(page,"player-playlists-mobile");
  await page.keyboard.press("Escape");await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  await page.locator('[data-player-tool="lyrics"]').click();await page.locator("[data-music-lyric]").first().waitFor();
  await proof(page,"player-lyrics-mobile");await page.keyboard.press("Escape");
  await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  await page.locator('[data-player-tool="queue"]').click();assert.equal(await page.locator(".reader-music-queue-row").count(),3);
  await proof(page,"player-queue-mobile");
  await page.locator('.player-tool-tabs [data-player-tool="library"]').click();
  assert.equal(await page.locator("[data-music-soundcloud-query]").isVisible(),true,"library opens the real search tab, not an inactive panel");
  assert(await page.locator("[data-music-soundcloud-query]").evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
  assert(await page.locator(".reader-music-service-empty span").evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=14));
  assert(await page.locator(".reader-music-soundcloud-source a").evaluate(node=>node.getBoundingClientRect().height>=44));
  await proof(page,"player-library-mobile");
  await page.locator(".player-tool-sheet").evaluate(node=>{node.scrollTop=node.scrollHeight;});await proof(page,"player-library-list-mobile");
  await page.locator(".reader-music-manual summary").click();
  assert(await page.locator("[data-music-add-url]").evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=14));
  await page.locator(".player-tool-sheet").evaluate(node=>{node.scrollTop=node.scrollHeight;});await proof(page,"player-library-manual-mobile");
  await page.keyboard.press("Escape");await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  await page.locator('[data-player-tool="modes"]').click();assert.equal(await page.locator("[data-player-mode]").count(),4);
  await proof(page,"player-modes-mobile");await page.keyboard.press("Escape");await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  const beforePlays=await page.evaluate(()=>window.__SC_WIDGET_TELEMETRY__.plays);
  await finish(page);await page.waitForFunction(before=>window.__SC_WIDGET_TELEMETRY__.plays>before,beforePlays);
  await waitTrack(page,tracks[0].permalinkUrl);
  await page.evaluate(()=>window.HanamiReaderMusic.setReadingMode("pin-once"));await finish(page);
  await page.waitForFunction(()=>window.HanamiReaderMusic.snapshot().waitingForPin&&!window.HanamiReaderMusic.snapshot().playing);
  await waitTrack(page,tracks[0].permalinkUrl,false);
  const bindings=await page.evaluate(({tracks,ids})=>{
    const figures=[...document.querySelectorAll("#readerViewport figure[data-comment-context]")];
    return [0,1].map(i=>window.HanamiMusicDiscovery.assignTrack({...tracks[i],id:ids[i],type:"external",url:tracks[i].permalinkUrl},{...JSON.parse(figures[i].dataset.commentContext),x:.2+i*.2,y:.2}));
  },{tracks,ids});
  await page.evaluate(()=>window.HanamiGroupMusic.flush());await page.waitForFunction(()=>window.HanamiGroupMusic.snapshot().pendingCount===0);
  assert.equal(pins.size,2);
  assert(writes.every(({actor,body})=>actor===owner&&!Object.hasOwn(body,"actorId")&&!Object.hasOwn(body,"author_id")));
  await page.locator('[data-player-tool="group"]').click();await proof(page,"player-group-mobile");await page.keyboard.press("Escape");await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  await page.locator("[data-music-close]").click();await page.waitForFunction(()=>window.HanamiScreens.is("reader"));
  await page.locator(`[data-reader-music-pin="${bindings[0].id}"]`).waitFor();
  await waitTrack(page,tracks[0].permalinkUrl);
  await finish(page);await page.waitForFunction(()=>window.HanamiReaderMusic.snapshot().waitingForPin);
  await page.locator(`[data-reader-music-anchor="${bindings[1].id}"]`).evaluate(node=>node.scrollIntoView({block:"center"}));
  await waitTrack(page,tracks[1].permalinkUrl);
  assert.equal(await page.evaluate(()=>window.HanamiReaderMusic.snapshot().waitingForPin),false);
  await proof(page,"shared-pin-mobile");
  await page.evaluate(()=>window.HanamiReaderMusic.setReadingMode("queue-loop"));
  await waitTrack(page,tracks[0].permalinkUrl);assert.equal((await page.evaluate(()=>window.HanamiReaderMusic.snapshot())).queue.length,2);
  await page.locator(`[data-reader-music-anchor="${bindings[1].id}"]`).evaluate(node=>node.scrollIntoView({block:"center"}));await page.waitForTimeout(150);assert.equal(await currentUrl(page),tracks[0].permalinkUrl);
  await finish(page);await waitTrack(page,tracks[1].permalinkUrl);await finish(page);await waitTrack(page,tracks[0].permalinkUrl);
  await page.evaluate(()=>window.HanamiReaderMusic.setReadingMode("queue-once"));await waitTrack(page,tracks[0].permalinkUrl);
  await finish(page);await waitTrack(page,tracks[1].permalinkUrl);await finish(page);
  await page.waitForFunction(()=>window.HanamiReaderMusic.snapshot().queueFinished&&!window.HanamiReaderMusic.snapshot().playing);
  await page.evaluate(async(ids)=>{await window.HanamiReaderMusic.setQueue(ids,ids[0]);window.HanamiReaderMusic.toggleShuffle();await window.HanamiReaderMusic.toggle();},ids);
  const visited=[];
  for(let i=0;i<3;i++) {visited.push(await currentUrl(page));await finish(page);if(i<2) await page.waitForFunction(url=>{const s=window.HanamiReaderMusic.snapshot();return s.playing&&s.tracks.find(t=>t.id===s.current)?.permalinkUrl!==url;},visited.at(-1));}
  assert.equal(new Set(visited).size,3);await page.waitForFunction(()=>window.HanamiReaderMusic.snapshot().queueFinished);
  await page.evaluate(()=>window.HanamiReaderMusic.open());
  await proof(page,"player-finished-mobile");
  await page.setViewportSize({width:1280,height:900});await proof(page,"player-desktop");await page.setViewportSize({width:390,height:844});
  await page.locator("[data-player-share]").click();assert((await page.evaluate(()=>window.__V137_SHARES__))[0].url.startsWith("https://soundcloud.com/"));
  const popup=page.waitForEvent("popup");await page.locator("[data-player-source]").click();const source=await popup;await source.close();
  await page.locator('[data-player-tool="playlists"]').click();
  const restoredToolId=await page.evaluate(()=>window.HanamiScreens.current().id);
  await page.reload();await page.waitForFunction(()=>window.HanamiScreens.is("reader-player-tool")&&!!document.querySelector(".player-tool-sheet"));
  assert.equal(await page.evaluate(()=>window.HanamiScreens.current().id),restoredToolId);
  assert.equal(await page.evaluate(()=>window.HanamiReaderMusic.snapshot().playing),false,"reload never autoplays");
  assert.equal(await page.locator(".player-private-lists b").first().textContent(),"Lectura nocturna");
  await page.keyboard.press("Escape");await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  await page.evaluate(()=>window.HanamiReaderMusic.close());await page.waitForFunction(()=>window.HanamiScreens.is("reader"));
  await page.goForward();await page.waitForFunction(()=>window.HanamiScreens.is("reader-music")&&!!document.querySelector(".player-screen"));
  await page.goForward();await page.waitForFunction(()=>window.HanamiScreens.is("reader-player-tool")&&!!document.querySelector(".player-tool-sheet"));
  await page.keyboard.press("Escape");await page.waitForFunction(()=>window.HanamiScreens.is("reader-music"));
  await page.evaluate(()=>window.HanamiReaderMusic.close());await page.waitForFunction(()=>window.HanamiScreens.is("reader"));
  await page.evaluate(()=>window.HanamiGroupMusic.sync());
  assert.equal(await page.locator('[data-reader-music-anchor][data-share-state="shared"]').count(),2,"shared pages retain their stable book URL after a library-reader reload");

  const second=await setup(member), receiver=second.page;
  await receiver.evaluate(()=>window.HanamiGroupMusic.sync());await receiver.waitForFunction(()=>document.querySelectorAll('[data-reader-music-anchor][data-share-state="shared"]').length===2);
  await waitTrack(receiver,tracks[0].permalinkUrl);
  await receiver.locator(`[data-reader-music-anchor="${bindings[1].id}"]`).evaluate(node=>node.scrollIntoView({block:"center"}));
  await waitTrack(receiver,tracks[1].permalinkUrl);
  await receiver.evaluate(()=>window.HanamiReaderMusic.toggle());
  await receiver.locator(`[data-reader-music-anchor="${bindings[0].id}"]`).evaluate(node=>node.scrollIntoView({block:"center"}));
  await receiver.waitForTimeout(200);assert.equal(await receiver.evaluate(()=>window.HanamiReaderMusic.snapshot().playing),false,"manual pause must suppress automatic pins");
  assert.equal(await receiver.evaluate(()=>window.HanamiReaderMusic.snapshot().readingSuspended),true);

  failWrites=true;
  await page.evaluate(({track,id})=>window.HanamiMusicDiscovery.assignTrack({...track,id,type:"external",url:track.permalinkUrl},{...JSON.parse(document.querySelector("#readerViewport figure").dataset.commentContext),x:.7,y:.7}),{track:tracks[2],id:ids[2]});
  await page.waitForFunction(()=>window.HanamiGroupMusic.snapshot().pendingCount===1);
  const previousWrites=writes.length;
  await page.evaluate(async(member)=>{await window.HanamiSocialSync.signOut();localStorage.setItem("v137-test-user",member);},member);
  failWrites=false;await page.reload();await page.waitForFunction(()=>!!window.HanamiReaderMusic&&!!window.HanamiSocialSync);
  await page.evaluate(async()=>{await window.HanamiReaderMusic.ready;await window.HanamiSocialSync.ready;await window.HanamiGroupMusic.flush();});
  assert.equal(writes.length,previousWrites,"an old actor's outbox must not publish under another account");
  assert.equal(await page.evaluate(()=>window.HanamiReaderPlayer.snapshot().favorites.length),1);
  assert.equal(await page.evaluate(()=>window.HanamiReaderPlayer.snapshot().playlists[0].name),"Lectura nocturna");

  const activitiesBefore=publicActivity.length,writesBefore=writes.length;
  await receiver.evaluate(({track})=>{localStorage.setItem("hanami-incognito","true");const existing=window.HanamiReaderMusic.listTracks().find(t=>t.permalinkUrl===track.permalinkUrl);window.HanamiMusicDiscovery.assignTrack(existing||{...track,id:"incognito-fixture",type:"external",url:track.permalinkUrl},{...JSON.parse(document.querySelector("#readerViewport figure").dataset.commentContext),x:.8,y:.4});},{track:tracks[0]});
  await receiver.waitForTimeout(200);assert.equal(writes.length,writesBefore);assert.equal(publicActivity.length,activitiesBefore);
  assert(publicActivity.every(body=>!JSON.stringify(body).includes("/fixture/chapter")&&!JSON.stringify(body).includes("p_page_key")));
  denyReads=true;await receiver.evaluate(()=>window.HanamiGroupMusic.sync());
  assert.equal(await receiver.evaluate(()=>window.HanamiGroupMusic.snapshot().readDenied),true);
  assert.equal(await receiver.locator('[data-reader-music-anchor][data-share-state="shared"]').count(),0);
  await receiver.evaluate(()=>window.HanamiReaderMusic.open());
  await receiver.locator('[data-player-tool="group"]').click();await proof(receiver,"player-group-denied-mobile");
  assert.deepEqual(errors,[]);
  console.log("PASS: v137 mobile/desktop reference layout, lyrics/queue/favorites/playlists, reload/Back/Forward, Widget FINISH four-mode behavior, finite shuffle, automatic reading pins, two-user sharing, pause, revisions, account isolation and incognito");
} catch(error) {
  for(const context of browser.contexts()) for(const page of context.pages()) {
    if(page.isClosed()||!page.url().startsWith(base)) continue;
    console.error("Final diagnostic",JSON.stringify(await page.evaluate(()=>{
      const s=window.HanamiReaderMusic?.snapshot?.()||{};
      return {current:s.current,queue:s.queue,queueVisited:s.queueVisited,readingMode:s.readingMode,playing:s.playing,waitingForPin:s.waitingForPin,queueFinished:s.queueFinished,suspended:s.readingSuspended,pin:s.pin,status:document.querySelector("[data-music-status]")?.textContent,screen:window.HanamiScreens?.current?.()?.type,group:window.HanamiGroupMusic?.snapshot?.(),errors:window.__SC_WIDGET_TELEMETRY__?.loads?.slice(-4)};
    })));
  }
  throw error;
} finally {await browser.close();}