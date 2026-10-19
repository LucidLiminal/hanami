const screens=window.HanamiScreens;
if(screens){
 screens.registerType(['root','source','explore-detail','migration-candidate-detail','global-search','extension-details','sources-filter','extensions-filter','migrate-manga','extension-stores','source-preferences','missing-source'],record=>{const result=window.HanamiAppRestoreScreen?.(record);if(record.type==='root'&&record.data?.tab==='library')queueMicrotask(()=>window.HanamiLibrary?.restoreRootState?.());return result});
 screens.registerType('library-detail',record=>window.HanamiLibrary?.restoreScreen?.(record));
 screens.registerType('reader',record=>{const data=record.data||{},parent=!data.groupId?screens.snapshot().find(r=>r.id===record.parent):null,group=data.groupId?data:parent?.type==='group-manga-detail'?{...data,...parent.data}:null;if(group)return window.HanamiAppRestoreGroupReader?.(group)??false;if(data.mangaId)return window.HanamiLibrary?.openDeepChapter?.(data.mangaId,data.chapterUrl||data.chapterNumber,true);return window.HanamiAppRestoreExploreReader?.(data)??false});
 screens.registerType(['migration-config','migrate-search','migration-list'],record=>window.HanamiMigrationConfig?.restore?.(record));
 screens.registerType(['updates-upcoming','updates-errors','updates-downloads'],record=>window.HanamiUpdatesTab?.restore?.(record));
 screens.registerType(['more-downloads','more-background','more-categories','more-stats','more-data','more-settings','more-install','more-support','more-about','more-help','more-setting'],record=>window.HanamiMoreTab?.restore?.(record));
 screens.registerType('data-backup-create',record=>window.HanamiDataStorage?.restore?.(record));
 screens.registerType('data-backup-restore',()=>false);
 // Layout can temporarily clamp scroll to zero while a paginated source is
 // rebuilding. Never persist that intermediate position or a departed screen's
 // delayed scroll event into the current screen.
 const scrollOwner=()=>{const current=screens.current?.();return current&&current.type!=='reader'&&!screens.isTransitioning?.()?current:null};
 const saveScroll=(owner,y)=>{if(owner&&screens.current?.()?.id===owner.id&&!screens.isTransitioning?.())screens.updateData?.({_scrollY:Math.round(y)})};
 let timer;addEventListener('scroll',()=>{clearTimeout(timer);const owner=scrollOwner(),y=scrollY;if(owner)timer=setTimeout(()=>saveScroll(owner,y),120)},{passive:true});
 addEventListener('pagehide',()=>{clearTimeout(timer);saveScroll(scrollOwner(),scrollY)});
}
window.HanamiScreenRestoration={restore:()=>screens?.restoreCurrent?.(),supported:type=>['reading-group','reading-group-access','reading-group-invites','group-manga-detail','root','source','explore-detail','migration-candidate-detail','global-search','extension-details','sources-filter','extensions-filter','migrate-manga','extension-stores','source-preferences','missing-source','library-detail','reader','reader-music','reader-player-tool','migration-config','migrate-search','migration-list','updates-upcoming','updates-errors','updates-downloads','more-downloads','more-background','more-categories','more-stats','more-data','more-settings','more-install','more-support','more-about','more-help','more-setting','data-backup-create'].includes(type)};
