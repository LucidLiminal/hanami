const screens=window.HanamiScreens;
if(screens){
 screens.registerType(['root','source','explore-detail','migration-candidate-detail','global-search','extension-details','sources-filter','extensions-filter','migrate-manga','extension-stores','source-preferences','missing-source'],record=>{const result=window.HanamiAppRestoreScreen?.(record);if(record.type==='root'&&record.data?.tab==='library')queueMicrotask(()=>window.HanamiLibrary?.restoreRootState?.());return result});
 screens.registerType('library-detail',record=>window.HanamiLibrary?.restoreScreen?.(record));
 screens.registerType('reader',record=>{const data=record.data||{};if(data.mangaId)return window.HanamiLibrary?.openDeepChapter?.(data.mangaId,data.chapterUrl||data.chapterNumber,true);return window.HanamiAppRestoreExploreReader?.(data)??false});
 screens.registerType(['migration-config','migrate-search','migration-list'],record=>window.HanamiMigrationConfig?.restore?.(record));
 screens.registerType(['updates-upcoming','updates-errors','updates-downloads'],record=>window.HanamiUpdatesTab?.restore?.(record));
 screens.registerType(['more-downloads','more-background','more-categories','more-stats','more-data','more-settings','more-install','more-support','more-about','more-help','more-setting'],record=>window.HanamiMoreTab?.restore?.(record));
 screens.registerType('data-backup-create',record=>window.HanamiDataStorage?.restore?.(record));
 screens.registerType('data-backup-restore',()=>false);
 let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{const current=screens.current?.();if(current?.type!=='reader')screens.updateData?.({_scrollY:Math.round(scrollY)})},120)},{passive:true});
 addEventListener('pagehide',()=>{const current=screens.current?.();if(current?.type!=='reader')screens.updateData?.({_scrollY:Math.round(scrollY)})});
}
window.HanamiScreenRestoration={restore:()=>screens?.restoreCurrent?.(),supported:type=>['root','source','explore-detail','migration-candidate-detail','global-search','extension-details','sources-filter','extensions-filter','migrate-manga','extension-stores','source-preferences','missing-source','library-detail','reader','reader-music','reader-player-tool','migration-config','migrate-search','migration-list','updates-upcoming','updates-errors','updates-downloads','more-downloads','more-background','more-categories','more-stats','more-data','more-settings','more-install','more-support','more-about','more-help','more-setting','data-backup-create'].includes(type)};
