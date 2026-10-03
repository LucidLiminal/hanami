import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";
const base = process.env.HANAMI_TEST_URL || "http://127.0.0.1:4175";
const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pins = new Map();
const writes = [];
const publicActivity = [];
const chapterAliases = new Map();
const identityRequests = [];
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
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || "/usr/local/bin/chromium", headless:true, args:["--no-sandbox","--mute-audio"] });
const errors = [];
const json = (route,data,status=200) => route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
async function setup(user, scConfig = {}, { outbox = null, identitySupport = true } = {}) {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:"block",acceptDownloads:true});
  await context.addInitScript({content:"window.__SC_V138_CONFIG__="+JSON.stringify(scConfig)+";"+String.fromCharCode(10)+await readFile(new URL("fixtures/soundcloud-widget-v138.js",import.meta.url),"utf8")});
  await context.addInitScript(({user,outbox})=>{
    const id=localStorage.getItem("v137-test-user") || user;
    localStorage.setItem("hanami-supabase-session-v1",JSON.stringify({access_token:`fixture-${id}`,expires_at:Math.floor(Date.now()/1000)+3600,user:{id,is_anonymous:true,user_metadata:{display_name:id.endsWith("1")?"Owner":"Member"}}}));
    localStorage.setItem("hanami-installed-sources",JSON.stringify(["fixture.source"]));
    localStorage.setItem("hanami-library",JSON.stringify([{id:"fixture-book",title:"Lectura v138",url:"/fixture/book",sourceId:"fixture.source",favorite:true,categories:["default"],_chapters:[{url:"/fixture/chapter/1",number:1,name:"Capítulo 1"}]}]));
    if(outbox) localStorage.setItem("hanami-reader-music-group-outbox-v137",JSON.stringify(outbox));
    window.__V137_SHARES__=[];
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:async(data)=>{
      window.__V137_SHARES__.push({url:data.url,title:data.title,fileName:data.files?.[0]?.name,fileSize:data.files?.[0]?.size});
    }});
  },{user,outbox});
  await context.addInitScript(() => {
    window.__MEDIA_V138__ = { audios: [], ended: {} };
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, { construct(target, args) {
      const audio = Reflect.construct(target, args);
      window.__MEDIA_V138__.audios.push(audio);
      audio.addEventListener("ended", () => {
        const id = audio.dataset.musicSource?.split("|")[0];
        if (id) window.__MEDIA_V138__.ended[id] = (window.__MEDIA_V138__.ended[id] || 0) + 1;
      });
      return audio;
    }});
  });
  await context.route("https://w.soundcloud.com/player/**",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Widget fixture</title>"}));
  await context.route("https://soundcloud.com/**",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Source fixture</title>"}));
  await context.route("**/v137-page-*.png",route=>route.fulfill({contentType:"image/png",body:image}));
  await context.route("https://i1.sndcdn.com/v137-art-*.jpg",route=>route.fulfill({contentType:"image/jpeg",body:art[Number(route.request().url().match(/art-(\d)/)?.[1]||0)]}));
  await context.route("**/api/music/capabilities",route=>json(route,{soundcloud:{widget:true,oembed:true,searchConfigured:false}}));
  await context.route("**/api/source/fixture.source/**",route=>{
    if(new URL(route.request().url()).pathname.endsWith("/pages")) return json(route,[0,1,2].map(i=>({imageUrl:`/v137-page-${i}.png`})));
    if(new URL(route.request().url()).pathname.endsWith("/chapters")) return json(route,[{url:"/fixture/chapter/1",number:1,name:"Capítulo 1"}]);
    return json(route,{title:"Lectura v138",url:"/fixture/book"});
  });
  await context.route("**/api/music/lyrics?**",route=>json(route,{provider:"LRCLIB",lyrics:"[00:00.00]Breathe with the page\n[00:02.00]The story continues\n[00:08.00]One more chapter",synced:true}));
  await context.route("**/api/social-config",route=>json(route,{enabled:true,url:"https://v137.supabase.test",anonKey:"fixture-public-anon"}));
  await context.route("https://v137.supabase.test/**",route=>{
    const url=new URL(route.request().url());
    const actor=(route.request().headers().authorization||"").replace("Bearer fixture-","");
    const identityRpc = /\/rpc\/(register_group_chapter_identity|list_group_chapter_aliases|list_group_reader_music_pins_v144|list_group_music_identity_inventory|verify_group_chapter_alias)$/.test(url.pathname);
    if (identityRpc) {
      identityRequests.push({ path:url.pathname, supported:identitySupport });
      if (!identitySupport) return json(route,{code:"PGRST202",message:"Function not installed"},404);
      if (denyReads) return json(route,{code:"42501",message:"Not a member"},403);
      const body=route.request().postDataJSON();
      if (url.pathname.endsWith("/rpc/register_group_chapter_identity")) {
        const key=JSON.stringify([body.p_group,body.p_source_id,body.p_work_ref,body.p_chapter_ref]);
        let row=chapterAliases.get(key);
        if (!row) {
          row={group_id:body.p_group,source_id:body.p_source_id,work_ref:body.p_work_ref,chapter_ref:body.p_chapter_ref,
            chapter_id:body.p_chapter_id,work_id:body.p_work_id,remote_id:body.p_remote_chapter_id||"",
            verified:false,pages_equivalent:true,updated_at:"2026-01-01T00:00:00Z"};
          chapterAliases.set(key,row);
        }
        return json(route,row);
      }
      if (url.pathname.endsWith("/rpc/list_group_chapter_aliases"))
        return json(route,[...chapterAliases.values()].filter(row=>row.group_id===body.p_group).slice(body.p_offset,body.p_offset+body.p_limit));
      if (url.pathname.endsWith("/rpc/list_group_reader_music_pins_v144"))
        return json(route,[...pins.values()].filter(pin=>!pin.deleted_at&&pin.group_id===body.p_group&&body.p_page_keys.includes(pin.page_key)));
      if (url.pathname.endsWith("/rpc/list_group_music_identity_inventory"))
        return json(route,[...pins.values()].filter(pin=>pin.group_id===body.p_group).slice(body.p_offset,body.p_offset+body.p_limit));
      return json(route,{code:"42501",message:"Moderator review required"},403);
    }
    if(url.pathname.endsWith("/auth/v1/user")) return json(route,{id:actor,is_anonymous:true,user_metadata:{display_name:"Fixture reader"}});
    if(url.pathname.endsWith("/auth/v1/logout")) return json(route,{});
    if(url.pathname.endsWith("/rpc/list_my_reading_groups")) return json(route,[{id:group,name:"Lectura compartida",owner_id:owner,members:[{id:owner,role:"owner",state:"active"},{id:member,role:"member",state:"active"}],member_count:2}]);
    if(url.pathname.endsWith("/rpc/list_reader_music_trends")) return json(route,[]);
    if(url.pathname.endsWith("/rpc/record_reader_music_activity")) {publicActivity.push(route.request().postDataJSON());return json(route,{accepted:true});}
    if(url.pathname.endsWith("/rpc/upsert_group_reader_music_pin")) {
      if(failWrites) return route.abort("internetdisconnected");
      const body=route.request().postDataJSON(); writes.push({actor,body});
      if(body.p_track.artwork&&!/^https:\/\/i[0-9]*\.sndcdn\.com\//.test(body.p_track.artwork))
        return json(route,{code:"22023",message:"Artwork must use the SoundCloud CDN"},400);
      const previous=pins.get(body.p_pin_id);
      if(previous && previous.author_id!==actor) return json(route,{code:"42501",message:"Another author"},403);
      if(previous && body.p_revision<=previous.revision) return json(route,previous);
      const locator=JSON.parse(body.p_page_key);
      const identityRow=identitySupport&&chapterAliases.get(JSON.stringify(locator.slice(0,4)));
      const row={id:body.p_pin_id,group_id:body.p_group,author_id:actor,page_key:body.p_page_key,x:body.p_x,y:body.p_y,track:{...body.p_track,provider:"soundcloud",permalinkUrl:body.p_track.url},revision:body.p_revision,created_at:previous?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null,
        ...(identityRow?{chapter_id:identityRow.chapter_id,work_id:identityRow.work_id}:{})};
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
    window.HanamiReader.open({title:"Lectura v138",sourceId:"fixture.source",mangaId:"fixture-book",mangaUrl:"/fixture/book",chapter:{url:"/fixture/chapter/1",number:1,name:"Capítulo 1"},pages:[0,1,2].map(i=>({imageUrl:`/v137-page-${i}.png`}))});
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
  await writeFile(`/data/hanami-v141-${name}.html`,html);
  await page.screenshot({path:`/data/hanami-v141-${name}.png`});
}
async function reframeExpandedPin(page, id) {
  // Resizing scales the page image and can move its real anchor outside the
  // viewport. Scroll to that reading point before asserting the desktop card.
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator(`[data-reader-music-anchor="${id}"]`).evaluate(node =>
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  const card = page.locator(`[data-reader-music-pin="${id}"]`);
  await card.locator(".reader-music-pin-content").waitFor({ state: "visible" });
  assert(await card.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth &&
      rect.top >= 0 && rect.bottom <= innerHeight;
  }), "the expanded card stays inside the viewport after resize and scrolling");
}
async function dragPinVertical(page, id, delta) {
  const handle = page.locator(`[data-reader-music-pin="${id}"] .reader-music-pin-track`);
  let box = null;
  for (let attempt = 0; attempt < 20 && !box; attempt++) {
    box = await handle.boundingBox().catch(() => null);
    if (!box) await page.waitForTimeout(75);
  }
  assert(box, "the pin card provides a visible drag surface");
  const x = box.x + Math.min(24, box.width / 2);
  const y = box.y + Math.min(24, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + delta, { steps: 8 });
  await page.mouse.up();
}
async function touchDragPinVertical(page, id, delta, { cancel = false } = {}) {
  const handle = page.locator(`[data-reader-music-pin="${id}"] [data-music-pin-expand]`);
  let box = null;
  for (let attempt = 0; attempt < 20 && !box; attempt++) {
    box = await handle.boundingBox().catch(() => null);
    if (!box) await page.waitForTimeout(75);
  }
  assert(box, "the collapsed pin button provides a visible touch drag surface");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);
  const touch = (clientY) => [{ x, y: clientY, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(y) });
    for (let step = 1; step <= 8; step++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: touch(y + delta * step / 8),
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd", touchPoints: [],
    });
  } finally {
    await client.detach();
  }
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

function wav(seconds, frequency = 320) {
  const rate = 8000, frames = Math.round(rate * seconds), buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * frequency / rate) * 1000), 44 + i * 2);
  return buffer;
}
async function importLocal(page, name, seconds = 8) {
  return page.evaluate(async ({ name, base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const result = await window.HanamiReaderMusic.importFiles([new File([bytes], name, { type: "audio/wav" })]);
    if (result.failures.length) throw new Error(result.failures[0]);
    return window.HanamiReaderMusic.listTracks().find((track) => track.fileName === name).id;
  }, { name, base64: wav(seconds).toString("base64") });
}
const state = (page) => page.evaluate(() => window.HanamiReaderMusic.snapshot());
const telemetry = (page) => page.evaluate(() => window.__SC_WIDGET_TELEMETRY__);
async function addTracks(page) {
  return page.evaluate(async (tracks) => {
    const ids = [];
    for (const track of tracks) ids.push((await window.HanamiReaderMusic.addUrl(track.permalinkUrl, track)).id);
    return ids;
  }, tracks);
}
async function openSelector(page) {
  await page.evaluate(() => window.HanamiReaderMusicServices.openPicker({
    context: { ...JSON.parse(document.querySelector("#readerViewport figure").dataset.commentContext), x: .5, y: .25 },
  }));
  await page.waitForFunction(() => window.HanamiScreens.is("reader-music-services"));
}

try {
  const repairedPin = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const legacyOutbox = [{
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", actorId: owner, groupId: group, kind: "upsert",
    record: {
      id: repairedPin, groupId: group,
      pageKey: JSON.stringify([group, "fixture.source", "/fixture/book", "/fixture/chapter/1", 0]),
      x: .2, y: .25, revision: 1,
      track: { ...tracks[0], url: tracks[0].permalinkUrl, artwork: "https://covers.example.invalid/legacy.jpg" },
    },
  }];
  const recovered = await setup(owner, {}, { outbox: legacyOutbox, identitySupport:false });
  await recovered.page.evaluate(() => window.HanamiGroupMusic.flush());
  await recovered.page.waitForFunction(() => window.HanamiGroupMusic.snapshot().pendingCount === 0);
  assert.equal(pins.get(repairedPin)?.track.artwork, "", "an old pending pin is repaired before it reaches the RPC");
  const recoveredMember = await setup(member, {}, {identitySupport:false});
  await recoveredMember.page.evaluate(() => window.HanamiGroupMusic.sync());
  await recoveredMember.page.waitForFunction(() => document.querySelectorAll(".reader-music-pin").length === 1);
  assert.equal(await recoveredMember.page.evaluate(()=>window.HanamiSocialSync.identityStatus().available),false,
    "the old server is detected explicitly and music falls back to the legacy RPC");
  await recoveredMember.context.close();
  await recovered.context.close();
  pins.clear(); writes.length = 0;

  const batch = await setup(owner), batchPage = batch.page;
  const batchIds = await addTracks(batchPage);
  const batchTracks = tracks.map((track, index) => index === 1
    ? { ...track, artwork: "https://covers.example.invalid/remote-cover.jpg" }
    : track);
  const batchPins = await batchPage.evaluate(({ tracks, ids }) => {
    const context = JSON.parse(document.querySelector("#readerViewport figure").dataset.commentContext);
    return tracks.map((track, index) => window.HanamiMusicDiscovery.assignTrack(
      { ...track, id: ids[index], type: "external", url: track.permalinkUrl },
      { ...context, x: .18 + index * .24, y: .14 + index * .22 },
    ).id);
  }, { tracks: batchTracks, ids: batchIds });
  await batchPage.evaluate(() => window.HanamiGroupMusic.flush());
  await batchPage.waitForFunction(() => window.HanamiGroupMusic.snapshot().pendingCount === 0);
  assert.equal(pins.size, 3, "one malformed cover cannot leave the remaining pins pending");
  assert.equal(pins.get(batchPins[1])?.track.artwork, "", "the RPC receives a server-safe fallback cover");
  const batchMember = await setup(member);
  await batchMember.page.evaluate(() => window.HanamiGroupMusic.sync());
  await batchMember.page.waitForFunction(() => document.querySelectorAll(".reader-music-pin").length === 3);
  assert.equal(await batchMember.page.evaluate(()=>window.HanamiSocialSync.identityStatus().available),true);
  assert([...pins.values()].every(pin=>pin.chapter_id),"v144 preserves authoritative chapter metadata on shared pins");
  assert(identityRequests.some(row=>row.path.endsWith("/list_group_reader_music_pins_v144")&&row.supported),
    "the new shared-music RPC is exercised rather than treated as an empty legacy fixture");
  await batchMember.context.close();
  await batch.context.close();
  pins.clear(); writes.length = 0;

  const first = await setup(owner), page = first.page;
  assert.equal(await page.locator("#readerIndicator").count(), 0);
  const ids = await addTracks(page);
  const localId = await importLocal(page, "Lectura local.wav");
  await page.evaluate(async (id) => { await window.HanamiReaderMusic.play(id); window.HanamiReaderMusic.open(); }, ids[0]);
  await page.locator('[data-player-tool="playlists"]').click();
  await page.locator("#playerPlaylistName").fill("Mi lectura local");
  await page.locator("[data-player-create-list] button").click();
  const listId = await page.evaluate(() => window.HanamiReaderPlayer.snapshot().playlists[0].id);
  for (const id of [...ids.slice(1), localId]) {
    await page.evaluate((id) => window.HanamiReaderMusic.play(id), id);
    await page.locator(`[data-player-list-add="${listId}"]`).click();
  }
  assert.equal((await page.evaluate(() => window.HanamiReaderPlayer.snapshot())).playlists[0].trackIds.length, 4);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.HanamiScreens.is("reader-music"));
  await page.locator("[data-music-close]").click();
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  await openSelector(page);
  await page.locator(`[data-music-picker-list="${listId}"] summary`).click();
  await page.evaluate(() => dispatchEvent(new CustomEvent("hanami-reader-player-personal-change")));
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "SUMMARY", "list refresh preserves keyboard focus");
  assert.equal(await page.locator(".music-local-track").count(), 4);
  assert.equal(await page.locator('.music-local-track:has-text("Lectura local")').count(), 1);
  await proof(page, "picker-lists-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await proof(page, "picker-lists-desktop");
  await page.setViewportSize({ width: 320, height: 640 });
  assert(await page.locator(".reader-music-picker").evaluate((node) => node.scrollWidth <= innerWidth));
  await proof(page, "picker-lists-narrow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(`[data-music-picker-source="local"][data-music-picker-pick="${localId}"]`).click();
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  const localPin = await page.evaluate(() => window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.trackId === window.HanamiReaderMusic.snapshot().current).id);
  const card = page.locator(`[data-reader-music-pin="${localPin}"]`);
  await card.waitFor();
  assert.equal(await card.locator(".reader-music-pin-content").isVisible(), false);
  assert(await card.locator("[data-music-pin-expand]").evaluate((button) => button.getBoundingClientRect().width >= 44));
  await proof(page, "pin-collapsed-mobile");
  const touchStartY = await page.evaluate((id) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id).y, localPin);
  await touchDragPinVertical(page, localPin, 150, { cancel: true });
  await page.waitForFunction(({ id, before }) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id)?.y > before + .05,
  { id: localPin, before: touchStartY });
  assert.equal(await card.locator(".reader-music-pin-content").isVisible(), false,
    "dragging a collapsed pin must not open it as a tap");
  // A drag suppresses its synthetic click; allow the intentional click below.
  await page.waitForTimeout(650);
  await card.locator("[data-music-pin-expand]").click();
  assert.equal(await card.locator(".album-cover").isVisible(), true);
  assert.equal(await card.locator(".track-title").textContent(), "Lectura local");
  await card.locator("[data-music-pin-toggle]").click();
  await page.waitForFunction(() => !window.HanamiReaderMusic.snapshot().playing);
  assert.equal((await state(page)).readingSuspended, true);
  await card.locator("[data-music-pin-toggle]").click();
  await page.waitForFunction(() => window.HanamiReaderMusic.snapshot().playing);
  await proof(page, "pin-expanded-local-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await reframeExpandedPin(page, localPin);
  await proof(page, "pin-expanded-local-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await reframeExpandedPin(page, localPin);
  await card.locator("[data-music-pin-minimize]").click();
  assert.equal(await card.locator(".reader-music-pin-content").isVisible(), false);
  assert.equal((await state(page)).playing, true);
  await card.locator("[data-music-pin-expand]").click();
  await page.keyboard.press("Escape");
  assert.equal(await card.locator(".reader-music-pin-content").isVisible(), false);
  assert.equal(await page.evaluate(() => window.HanamiScreens.current().type), "reader");

  await card.locator("[data-music-pin-expand]").click();
  await card.locator("[data-music-pin-change]").click();
  await page.waitForFunction((id) => window.HanamiScreens.is("reader-music-services") &&
    window.HanamiReaderMusicServices.snapshot().picker.replaceBindingId === id, localPin);
  assert(await page.locator(".music-discovery-context").getByText("Se actualizarán este pin y la cola de lectura actual.").count());
  await proof(page, "pin-change-picker-mobile");
  await page.locator(`[data-music-picker-list="${listId}"] summary`).click();
  await page.locator(`[data-music-picker-source="local"][data-music-picker-pick="${ids[1]}"]`).click();
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  await waitTrack(page, tracks[1].permalinkUrl);
  const changedBinding = await page.evaluate((id) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id), localPin);
  assert.equal(changedBinding.trackId, ids[1]);
  assert.deepEqual((await state(page)).queue, [ids[1]], "replacing a pin rebuilds the current reading queue");
  assert.equal(await card.locator(".track-title").textContent(), tracks[1].title);
  assert.equal(await card.getAttribute("data-music-pin-draggable"), "true");

  const originalY = changedBinding.y;
  await dragPinVertical(page, localPin, 160);
  await page.waitForFunction(({ id, before }) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id)?.y > before + .05,
  { id: localPin, before: originalY });
  const loweredY = await page.evaluate((id) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id).y, localPin);
  await page.waitForTimeout(350);
  await dragPinVertical(page, localPin, -200);
  await page.waitForFunction(({ id, before }) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id)?.y < before - .05,
  { id: localPin, before: loweredY });
  const movedY = await page.evaluate((id) =>
    window.HanamiMusicDiscovery.snapshot().bindings.find((binding) => binding.id === id).y, localPin);
  assert.deepEqual((await state(page)).queue, [ids[1]], "moving a pin keeps the live reading queue aligned");
  await page.evaluate(() => window.HanamiGroupMusic.flush());
  assert(Math.abs((pins.get(localPin)?.y ?? -1) - movedY) < .001, "the final vertical coordinate reaches the shared pin");
  await card.locator("[data-music-pin-minimize]").click();

  await page.evaluate(async (id) => { await window.HanamiReaderMusic.play(id); window.HanamiReaderMusic.open(); }, ids[0]);
  const sourceLink = page.locator("[data-player-source]");
  assert.equal(await sourceLink.textContent(), "Abrir canción en su fuente original");
  assert.equal(await sourceLink.getAttribute("href"), tracks[0].permalinkUrl);
  assert.equal(await page.locator("[data-player-download]").count(), 0);
  const popup = page.waitForEvent("popup");
  await sourceLink.click(); const original = await popup; await original.close();
  await proof(page, "player-source-mobile");
  await page.setViewportSize({ width: 320, height: 640 });
  assert(await page.locator(".player-footer").evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight + 1), "long source label fits a compact screen");
  assert(await page.locator(".player-screen").evaluate((node) => node.scrollWidth <= innerWidth));
  await proof(page, "player-source-narrow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-music-close]").click();
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  if (!await card.locator(".reader-music-pin-content").isVisible())
    await card.locator("[data-music-pin-expand]").click();
  const beforeRemove = await state(page), beforeLoads = (await telemetry(page)).loads.length;
  await card.locator("[data-music-pin-remove]").click();
  await card.waitFor({ state: "detached" });
  assert(!(await state(page)).queue.includes(ids[1]));
  assert.equal((await state(page)).current, beforeRemove.current);
  assert.equal((await telemetry(page)).loads.length, beforeLoads, "removing an inactive pin does not restart the active song");
  assert((await state(page)).tracks.some((track) => track.id === localId));
  assert((await page.evaluate(() => window.HanamiReaderPlayer.snapshot())).playlists[0].trackIds.includes(localId));

  await page.evaluate(() => window.HanamiReaderMusicServices.openPicker());
  await page.locator(`[data-music-picker-list="${listId}"] summary`).click();
  await page.locator(`[data-music-picker-source="local"][data-music-picker-pick="${ids[1]}"]`).click();
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  await waitTrack(page, tracks[1].permalinkUrl);
  assert.deepEqual((await state(page)).queue, [...ids, localId]);
  assert.equal((await state(page)).readingMode, "queue-once");
  await page.evaluate(() => window.__SC_V138_FINISH__());
  await waitTrack(page, tracks[2].permalinkUrl);

  const activePin = await page.evaluate(async ({ track, ids }) => {
    const binding = window.HanamiMusicDiscovery.assignTrack({ ...track, id: ids[0], type: "external", url: track.permalinkUrl },
      { ...JSON.parse(document.querySelector("#readerViewport figure").dataset.commentContext), x: .4, y: .35 });
    await window.HanamiReaderMusic.playPin(ids[0], { id: binding.id, groupId: binding.groupId, title: track.title }, { queue: ids.slice(0, 2) });
    return binding.id;
  }, { track: tracks[0], ids });
  await page.evaluate(() => window.HanamiGroupMusic.flush());
  const remoteCard = page.locator(`[data-reader-music-pin="${activePin}"]`);
  await remoteCard.locator("[data-music-pin-expand]").click();
  await proof(page, "pin-expanded-remote-mobile");
  await page.setViewportSize({ width: 320, height: 640 });
  await reframeExpandedPin(page, activePin);
  assert(await remoteCard.evaluate((node) => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  await proof(page, "pin-expanded-remote-narrow");
  await page.setViewportSize({ width: 1280, height: 900 });
  await reframeExpandedPin(page, activePin);
  await proof(page, "pin-expanded-remote-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await reframeExpandedPin(page, activePin);
  await remoteCard.locator("[data-music-pin-remove]").click();
  await waitTrack(page, tracks[1].permalinkUrl);
  assert(!(await state(page)).queue.includes(ids[0]));
  assert((await state(page)).tracks.some((track) => track.id === ids[0]));
  await page.evaluate(() => window.HanamiGroupMusic.flush());
  assert(pins.get(activePin)?.deleted_at, "authorized removal is sent to the real deletion RPC shape");

  await page.evaluate(({ track, id }) => window.HanamiMusicDiscovery.assignTrack({ ...track, id, type: "external", url: track.permalinkUrl },
    { ...JSON.parse(document.querySelector("#readerViewport figure").dataset.commentContext), x: .4, y: .2 }), { track: tracks[2], id: ids[2] });
  await page.evaluate(() => window.HanamiGroupMusic.flush());
  const second = await setup(member), receiver = second.page;
  await receiver.evaluate(() => window.HanamiGroupMusic.sync());
  const received = receiver.locator(".reader-music-pin");
  await received.locator("[data-music-pin-expand]").click();
  assert.equal(await received.locator("[data-music-pin-remove]").isDisabled(), true);
  assert.equal(await received.locator("[data-music-pin-change]").isDisabled(), true);
  await proof(receiver, "pin-shared-readonly-mobile");
  await received.locator("[data-music-pin-minimize]").click();
  await receiver.evaluate(() => window.HanamiReaderMusicServices.openPicker());
  assert.equal(await receiver.locator(".music-local-playlists").getByText("Todavía no tienes listas").count(), 1);
  await proof(receiver, "picker-lists-empty-mobile");
  await second.context.close();
  await first.context.close();
  pins.clear();
  console.log("PASS: side-card change opens the picker, replaces the live queue, vertical drag persists shared coordinates, and existing player/list/permission flows remain intact");

  const natural = await setup(owner, { natural: true, stale: true }), naturalPage = natural.page;
  const naturalIds = await addTracks(naturalPage);
  await naturalPage.evaluate(async (id) => { await window.HanamiReaderMusic.setReadingMode("queue-once"); await window.HanamiReaderMusic.play(id); }, naturalIds[0]);
  await waitTrack(naturalPage, tracks[1].permalinkUrl);
  await waitTrack(naturalPage, tracks[2].permalinkUrl);
  await naturalPage.waitForFunction(() => window.HanamiReaderMusic.snapshot().queueFinished && !window.HanamiReaderMusic.snapshot().playing);
  assert.deepEqual((await telemetry(naturalPage)).loads.map((load) => load.url), tracks.slice(1).map((track) => track.permalinkUrl));
  assert((await telemetry(naturalPage)).callbacks >= 2);
  await naturalPage.evaluate(async (id) => { await window.HanamiReaderMusic.setReadingMode("pin-loop"); await window.HanamiReaderMusic.play(id); }, naturalIds[0]);
  const loopStart = await telemetry(naturalPage);
  await naturalPage.waitForFunction((before) => window.__SC_WIDGET_TELEMETRY__.finishes >= before + 2 && window.HanamiReaderMusic.snapshot().playing, loopStart.finishes);
  const loopEnd = await telemetry(naturalPage);
  assert.equal(loopEnd.loads.length, loopStart.loads.length, "repeat must seek/play, never reload the iframe");
  assert.equal(loopEnd.instances, 1);
  assert(loopEnd.seeks.filter((position) => position === 0).length >= 3);
  await naturalPage.evaluate(async (id) => { await window.HanamiReaderMusic.setReadingMode("pin-once"); await window.HanamiReaderMusic.play(id); }, naturalIds[0]);
  await naturalPage.waitForFunction(() => window.HanamiReaderMusic.snapshot().waitingForPin && !window.HanamiReaderMusic.snapshot().playing);
  const waiting = await telemetry(naturalPage);
  await naturalPage.waitForTimeout(300);
  assert.equal((await telemetry(naturalPage)).plays, waiting.plays);
  await naturalPage.evaluate(async (id) => { await window.HanamiReaderMusic.setReadingMode("queue-loop"); await window.HanamiReaderMusic.play(id); }, naturalIds[0]);
  await waitTrack(naturalPage, tracks[1].permalinkUrl);
  await waitTrack(naturalPage, tracks[2].permalinkUrl);
  await waitTrack(naturalPage, tracks[0].permalinkUrl);
  await natural.context.close();
  console.log("PASS: automatic SDK natural endings for all four modes, explicit ready callbacks, one reused iframe, and stale FINISH/PAUSE/progress events without another click");

  const fallback = await setup(owner, { natural: true, noFinish: true }), fallbackPage = fallback.page;
  const fallbackIds = await addTracks(fallbackPage);
  await fallbackPage.evaluate((id) => window.HanamiReaderMusic.play(id), fallbackIds[0]);
  await fallbackPage.waitForFunction(() => window.__SC_WIDGET_TELEMETRY__.finishes >= 2 && window.__SC_WIDGET_TELEMETRY__.plays >= 3 && window.HanamiReaderMusic.snapshot().playing, null, { timeout: 15000 });
  assert.equal((await telemetry(fallbackPage)).loads.length, 0);
  await fallback.context.close();
  console.log("PASS: missing FINISH events are recovered repeatedly by the same polling loop");

  const local = await setup(owner), localPage = local.page;
  const localIds = [await importLocal(localPage, "Primera local.wav", .9), await importLocal(localPage, "Segunda local.wav", 1.1)];
  await localPage.evaluate(async (ids) => {
    await window.HanamiReaderMusic.setReadingMode("queue-once");
    await window.HanamiReaderMusic.setQueue(ids, ids[0]);
    window.HanamiReaderMusic.open();
  }, localIds);
  await localPage.locator(".player-screen [data-music-toggle]").click();
  await localPage.waitForFunction((id) => window.HanamiReaderMusic.snapshot().current === id && window.HanamiReaderMusic.snapshot().playing, localIds[1]);
  await localPage.waitForFunction(() => window.HanamiReaderMusic.snapshot().queueFinished);
  await localPage.evaluate(async (id) => { await window.HanamiReaderMusic.setReadingMode("pin-loop"); await window.HanamiReaderMusic.play(id); }, localIds[0]);
  const nativeSource = await localPage.evaluate((id) => window.__MEDIA_V138__.audios.find((audio) => audio.dataset.musicSource?.startsWith(id)).src, localIds[0]);
  await localPage.waitForFunction((id) => window.__MEDIA_V138__.ended[id] >= 3 && window.HanamiReaderMusic.snapshot().playing, localIds[0]);
  assert.equal(await localPage.evaluate((id) => window.__MEDIA_V138__.audios.find((audio) => audio.dataset.musicSource?.startsWith(id)).src, localIds[0]), nativeSource);
  assert.deepEqual(errors, []);
  console.log("PASS: actual native WAV endings automatically advance and repeat without replacing the authorized media source");
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    if (page.isClosed() || !page.url().startsWith(base)) continue;
    console.error("v141 diagnostic", JSON.stringify(await page.evaluate(() => ({
      music: window.HanamiReaderMusic?.snapshot?.(),
      discovery: window.HanamiMusicDiscovery?.snapshot?.(),
      pickerStatus: document.querySelector("[data-music-picker-status]")?.textContent,
      pins: [...document.querySelectorAll("[data-reader-music-pin]")].map((node) => ({ id: node.dataset.readerMusicPin, expanded: node.classList.contains("is-expanded") })),
      screen: window.HanamiScreens?.current?.()?.type, sdk: window.__SC_V138_STATE__?.(), telemetry: window.__SC_WIDGET_TELEMETRY__,
    }))));
  }
  throw error;
} finally { await browser.close(); }
