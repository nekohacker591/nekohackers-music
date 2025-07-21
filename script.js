const globalPlayerState = {
    currentPlayingAudio: null,
    currentPlayingPlayerDiv: null,
    lastVolume: parseFloat(localStorage.getItem('nekohacker_globalVolume')) || 0.75,
    isMuted: JSON.parse(localStorage.getItem('nekohacker_isMuted')) || false,
    _autoplayNextInternal: true, 
    get autoplayNext() { 
        return this._autoplayNextInternal;
    },
    set autoplayNext(value) {
        this._autoplayNextInternal = !!value; 
        localStorage.setItem('nekohacker_autoplayNext', JSON.stringify(this._autoplayNextInternal));
        const autoplayBtn = document.getElementById('autoplay-toggle-btn');
        if (autoplayBtn) {
            autoplayBtn.textContent = `Autoplay: ${this._autoplayNextInternal ? 'ON' : 'OFF'}`;
            autoplayBtn.classList.toggle('autoplay-on', this._autoplayNextInternal);
        }
    }
};

let songsData = []; // This will be filled by fetching songs.json
const defaultArtwork = 'https://i.imgur.com/ClMFeop.png';

let sidebarToggleBtn, navLinks, tabContents, songListUl, musicSearchInput,
    autoplayToggleBtnElement, 
    playerViewContainer, homeContent, musicContent, pageTitleElement;

let iconMap = {};

// ... (keep all your functions like getAndApplyIcon, formatTime, etc. here)
function getAndApplyIcon(element, cssVarName) {
    if (!element) return;
    const iconValue = iconMap[cssVarName] || getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
    iconMap[cssVarName] = iconValue;
    element.classList.remove('image-icon');
    element.style.backgroundImage = '';
    element.textContent = '';
    if (iconValue.toLowerCase().startsWith('url(')) {
        element.classList.add('image-icon');
        element.style.backgroundImage = iconValue;
    } else {
        element.textContent = iconValue.replace(/['"]/g, '');
    }
}
function updateSidebarToggleIcon() {
    if (!sidebarToggleBtn) return;
    const iconElement = sidebarToggleBtn.querySelector('.icon');
    if (!iconElement) return;
    const isSidebarOpen = document.body.classList.contains('sidebar-open');
    getAndApplyIcon(iconElement, isSidebarOpen ? '--icon-close' : '--icon-hamburger');
    sidebarToggleBtn.setAttribute('aria-expanded', isSidebarOpen.toString());
}
function setupIcons() {
    ['--icon-home', '--icon-music', '--icon-play', '--icon-pause', '--icon-download', '--icon-share', '--icon-mute', '--icon-unmute', '--icon-hamburger', '--icon-close'].forEach(varName => {
        iconMap[varName] = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    });
    updateSidebarToggleIcon();
    const homeNavIcon = document.querySelector('#page-wrapper .nav-link[data-view="home"] .icon');
    const musicNavIcon = document.querySelector('#page-wrapper .nav-link[data-view="music"] .icon');
    if (homeNavIcon) getAndApplyIcon(homeNavIcon, '--icon-home');
    if (musicNavIcon) getAndApplyIcon(musicNavIcon, '--icon-music');
}
function formatTime(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}
function createPlayerElement(track, index, isEmbedStyle = false) {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player";
    if (isEmbedStyle) playerDiv.classList.add("player-embed");
    playerDiv.id = `player-${index}`;
    playerDiv.dataset.src = track.file;
    playerDiv.dataset.index = index;
    const actionsHTML = `
        <a class="download-link" href="${track.file}" download="${track.title.replace(/[^\w\s.-]/g, '') || 'track'}.wav">
            <span class="icon"></span> Download
        </a>
        <button class="share-btn">
            <span class="icon"></span> Share
        </button>
        <span class="copied">Copied!</span>
    `;
    playerDiv.innerHTML = `
        <div class="track-title">${track.title}</div>
        <div class="controls">
            <button class="play-btn"><span class="icon"></span></button>
            <div class="progress-container">
                <span class="current-time">0:00</span>
                <div class="progress"><div class="progress-filled"></div></div>
                <span class="duration">--:--</span>
            </div>
        </div>
        ${!isEmbedStyle ? `<div class="actions">${actionsHTML}</div>` : ''}
        <div class="volume-container">
            <button class="mute-btn"><span class="icon"></span></button>
            <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="${globalPlayerState.lastVolume}">
        </div>
    `;
    getAndApplyIcon(playerDiv.querySelector('.play-btn .icon'), '--icon-play');
    getAndApplyIcon(playerDiv.querySelector('.mute-btn .icon'), globalPlayerState.isMuted ? '--icon-unmute' : '--icon-mute');
    if (!isEmbedStyle) {
        getAndApplyIcon(playerDiv.querySelector('.download-link .icon'), '--icon-download');
        getAndApplyIcon(playerDiv.querySelector('.share-btn .icon'), '--icon-share');
        const shareBtn = playerDiv.querySelector('.share-btn');
        const copiedMsg = playerDiv.querySelector('.copied');
        if (shareBtn && copiedMsg) {
            shareBtn.addEventListener('click', () => {
                const playerViewUrl = new URL(window.location.href);
                playerViewUrl.search = ''; // Clear existing params
                playerViewUrl.searchParams.set('view', 'player');
                playerViewUrl.searchParams.set('songId', index.toString());
                navigator.clipboard.writeText(playerViewUrl.href).then(() => {
                    copiedMsg.classList.add('show');
                    setTimeout(() => copiedMsg.classList.remove('show'), 1500);
                }).catch(err => console.error('Failed to copy share link:', err));
            });
        }
    }
    return playerDiv;
}
function initializeAudioForPlayer(playerDiv, autoPlay = false) {
  if (playerDiv.audioInitialized && playerDiv.audio && playerDiv.audio.src === playerDiv.dataset.src && !autoPlay) return;
  if (playerDiv.audio) { playerDiv.audio.pause(); playerDiv.audio.src = ""; }
  const audio = new Audio();
  audio.preload = "metadata";
  playerDiv.audio = audio;
  playerDiv.audioInitialized = true;
  const playBtnIconElement = playerDiv.querySelector('.play-btn .icon');
  const muteBtnIconElement = playerDiv.querySelector('.mute-btn .icon');
  const progressFilled = playerDiv.querySelector('.progress-filled');
  const progressBar = playerDiv.querySelector('.progress');
  const volumeSlider = playerDiv.querySelector('.volume-slider');
  const currentTimeDisplay = playerDiv.querySelector('.current-time');
  const durationDisplay = playerDiv.querySelector('.duration');
  const trackTitleElement = playerDiv.querySelector('.track-title');
  const songIndex = parseInt(playerDiv.dataset.index);
  audio.muted = globalPlayerState.isMuted;
  audio.volume = globalPlayerState.lastVolume;
  volumeSlider.value = globalPlayerState.lastVolume;
  getAndApplyIcon(muteBtnIconElement, globalPlayerState.isMuted ? '--icon-unmute' : '--icon-mute');
  volumeSlider.disabled = globalPlayerState.isMuted;
  audio.addEventListener('loadedmetadata', () => {
    durationDisplay.textContent = formatTime(audio.duration);
    if (autoPlay) { audio.play().catch(e => console.warn("Autoplay prevented:", e)); }
  });
  audio.addEventListener('play', () => {
    getAndApplyIcon(playBtnIconElement, '--icon-pause');
    playerDiv.classList.add('player-playing');
    globalPlayerState.currentPlayingAudio = audio; globalPlayerState.currentPlayingPlayerDiv = playerDiv;
    if (trackTitleElement) document.title = `▶ ${trackTitleElement.textContent} - Nekohacker591`;
  });
  audio.addEventListener('pause', () => {
    getAndApplyIcon(playBtnIconElement, '--icon-play');
    playerDiv.classList.remove('player-playing');
    if (globalPlayerState.currentPlayingAudio === audio && audio.ended) { document.title = 'Nekohackers Music'; }
  });
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) { const percent = (audio.currentTime / audio.duration) * 100; progressFilled.style.width = percent + '%'; }
    currentTimeDisplay.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener('ended', () => {
    getAndApplyIcon(playBtnIconElement, '--icon-play');
    progressFilled.style.width = '0%'; currentTimeDisplay.textContent = formatTime(0);
    playerDiv.classList.remove('player-playing'); document.title = 'Nekohackers Music';
    if (globalPlayerState.currentPlayingPlayerDiv === playerDiv) { globalPlayerState.currentPlayingAudio = null; globalPlayerState.currentPlayingPlayerDiv = null; }
    if (globalPlayerState.autoplayNext) {
        const currentView = new URLSearchParams(window.location.search).get('view');
        if (currentView === 'player' && songIndex < songsData.length - 1) { navigateToPlayerView(songIndex + 1, true); }
        else if (currentView === 'player' && songIndex === songsData.length - 1) { navigateToPlayerView(0, true); }
    }
  });
  audio.addEventListener('volumechange', () => {
    getAndApplyIcon(muteBtnIconElement, audio.muted || audio.volume === 0 ? '--icon-unmute' : '--icon-mute');
    volumeSlider.disabled = audio.muted;
    if (!audio.muted) { volumeSlider.value = audio.volume; globalPlayerState.lastVolume = audio.volume; }
    globalPlayerState.isMuted = audio.muted;
    localStorage.setItem('nekohacker_globalVolume', globalPlayerState.lastVolume.toString());
    localStorage.setItem('nekohacker_isMuted', JSON.stringify(globalPlayerState.isMuted));
  });
  volumeSlider.addEventListener('input', () => { audio.muted = false; audio.volume = parseFloat(volumeSlider.value); });
  playerDiv.querySelector('.mute-btn').addEventListener('click', () => { audio.muted = !audio.muted; });
  playerDiv.querySelector('.play-btn').addEventListener('click', () => {
    if (!audio.src || audio.src !== playerDiv.dataset.src) audio.src = playerDiv.dataset.src;
    if (audio.paused) {
      if (globalPlayerState.currentPlayingAudio && globalPlayerState.currentPlayingAudio !== audio) {
        globalPlayerState.currentPlayingAudio.pause();
        if(globalPlayerState.currentPlayingPlayerDiv) {
            globalPlayerState.currentPlayingPlayerDiv.classList.remove('player-playing');
             getAndApplyIcon(globalPlayerState.currentPlayingPlayerDiv.querySelector('.play-btn .icon'), '--icon-play');
        }
      }
      audio.play().catch(e => console.error("Play failed:", e));
    } else { audio.pause(); }
  });
  progressBar.addEventListener('click', (e) => {
    if (!audio.duration || audio.duration === Infinity) return;
    const rect = progressBar.getBoundingClientRect(); const newTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    audio.currentTime = newTime;
    if (audio.paused) { progressFilled.style.width = ((newTime / audio.duration) * 100) + '%'; currentTimeDisplay.textContent = formatTime(newTime); }
  });
  if (!audio.src && playerDiv.dataset.src) audio.src = playerDiv.dataset.src;
}
function populateUpNextList(currentSongId, mainContainer) {
    if (!mainContainer) return;
    let upNextContainer = mainContainer.querySelector('#up-next-list-container');
    if (!upNextContainer) {
        upNextContainer = document.createElement('div');
        upNextContainer.id = 'up-next-list-container';
        upNextContainer.innerHTML = `<h2>Up Next</h2><ul id="up-next-song-list"></ul>`;
        mainContainer.appendChild(upNextContainer);
    }
    const ul = upNextContainer.querySelector('#up-next-song-list');
    ul.innerHTML = '';
    if (songsData.length <= 1) { upNextContainer.style.display = 'none'; return; }
    upNextContainer.style.display = 'block';
    const numUpNext = 5;
    let songsToShow = [];
    for (let i = 1; i <= songsData.length -1 ; i++) {
        if (songsToShow.length >= numUpNext) break;
        const nextIndex = (currentSongId + i) % songsData.length;
        if (nextIndex === currentSongId) continue;
        if (!songsToShow.find(s => s.originalIndex === nextIndex)) { songsToShow.push({track: songsData[nextIndex], originalIndex: nextIndex}); }
    }
    if (songsToShow.length === 0) { ul.innerHTML = '<li class="song-item-empty">No other songs available.</li>'; return; }
    songsToShow.forEach(item => {
        const li = document.createElement('li');
        li.className = 'up-next-item';
        li.textContent = item.track.title;
        li.dataset.songId = item.originalIndex;
        if (globalPlayerState.autoplayNext && item.originalIndex === (currentSongId + 1) % songsData.length) { li.classList.add('playing-next'); }
        li.addEventListener('click', () => { navigateToPlayerView(item.originalIndex, false); });
        ul.appendChild(li);
    });
}
function setMetaTags(options = {}) {
    // *** THIS IS THE FIX FOR THE 'null' ERROR ***
    const defaults = { title: 'Nekohackers Music', description: 'Welcome to Nekohacker\'s portfolio...', url: window.location.href, type: 'website', imageUrl: defaultArtwork, audioUrl: null, trackIdForEmbed: null, twitterCardType: 'summary_large_image' };
    const config = { ...defaults, ...options };
    document.title = config.title;
    
    // This function is fine otherwise, no more changes needed here.
    const head = document.head; 
    head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach(tag => {
        if (!tag.hasAttribute('data-static')) tag.remove();
    });

    const tagsToSet = [
        { property: 'og:title', content: config.title },
        { property: 'og:description', content: config.description },
        { property: 'og:url', content: config.url },
        { property: 'og:type', content: config.type },
        { property: 'og:image', content: config.imageUrl },
        { name: 'twitter:card', content: config.twitterCardType },
        { name: 'twitter:title', content: config.title },
        { name: 'twitter:description', content: config.description },
        { name: 'twitter:image', content: config.imageUrl },
    ];
    if (config.audioUrl) { tagsToSet.push({ property: 'og:audio', content: config.audioUrl }); tagsToSet.push({ property: 'og:audio:type', content: 'audio/wav' }); }
    if (config.trackIdForEmbed !== null && songsData[config.trackIdForEmbed]) {
        const embedUrl = new URL(config.url);
        embedUrl.search = '';
        embedUrl.searchParams.set('embed', config.trackIdForEmbed.toString());
        tagsToSet.push({ name: 'twitter:player', content: embedUrl.href }); tagsToSet.push({ name: 'twitter:player:width', content: '500' }); tagsToSet.push({ name: 'twitter:player:height', content: '180' });
        const twitterCardIndex = tagsToSet.findIndex(tag => tag.name === 'twitter:card');
        if (twitterCardIndex > -1) tagsToSet[twitterCardIndex].content = 'player'; else tagsToSet.push({ name: 'twitter:card', content: 'player' });
    }
    tagsToSet.forEach(tagInfo => { 
        const meta = document.createElement('meta');
        if (tagInfo.property) meta.setAttribute('property', tagInfo.property); 
        if (tagInfo.name) meta.setAttribute('name', tagInfo.name); 
        meta.setAttribute('content', tagInfo.content); 
        head.appendChild(meta); 
    });
}
function populateSongList(filteredSongs = songsData) {
  if (!songListUl) return;
  songListUl.innerHTML = '';
  if (filteredSongs.length === 0 && musicSearchInput && musicSearchInput.value !== '') { songListUl.innerHTML = '<li class="song-item-empty">No tracks match your search, chief.</li>'; return; }
  filteredSongs.forEach((track) => {
    const actualIndex = songsData.findIndex(s => s.file === track.file); if (actualIndex === -1) return;
    const li = document.createElement('li'); li.className = 'song-item';
    const link = document.createElement('a'); link.href = `?view=player&songId=${actualIndex}`;
    link.textContent = track.title;
    link.addEventListener('click', (e) => { e.preventDefault(); navigateToPlayerView(actualIndex, false); });
    li.appendChild(link); songListUl.appendChild(li);
  });
}
function navigateToPlayerView(songId, playNow = false) {
    const url = new URL(window.location);
    url.searchParams.set('view', 'player'); url.searchParams.set('songId', songId.toString());
    url.searchParams.delete('s'); url.searchParams.delete('id'); url.searchParams.delete('share');
    window.history.pushState({ view: 'player', songId: songId }, '', url);
    renderView({ triggeredByAutoplayNext: playNow });
}
function renderView(options = {}) {
    if (!tabContents || !navLinks || !pageTitleElement || !playerViewContainer || !musicContent || !homeContent) return;
    const { triggeredByAutoplayNext = false } = options;
    const urlParams = new URLSearchParams(window.location.search);
    let view = urlParams.get('view');
    const songIdParam = urlParams.get('songId');
    const legacyShareIdParam = urlParams.get('id');
    const isLegacyShareMode = urlParams.get('share') === 'true';
    const searchQuery = urlParams.get('s');
    if (globalPlayerState.currentPlayingAudio && (!songIdParam || globalPlayerState.currentPlayingPlayerDiv?.dataset.index !== songIdParam)) { globalPlayerState.currentPlayingAudio.pause(); }
    if (isLegacyShareMode && legacyShareIdParam !== null && songsData[legacyShareIdParam]) { navigateToPlayerView(parseInt(legacyShareIdParam), false); return; }
    if (!view && !songIdParam) view = 'home';
    tabContents.forEach(tc => tc.classList.remove('active'));
    navLinks.forEach(link => link.classList.remove('active'));
    pageTitleElement.style.display = 'block';
    if (view !== 'player' && playerViewContainer.classList.contains('active')) { playerViewContainer.innerHTML = ''; }
    if (view === 'player' && songIdParam !== null && songsData[songIdParam]) {
        playerViewContainer.classList.add('active'); const songId = parseInt(songIdParam); const track = songsData[songId];
        const oldPlayer = playerViewContainer.querySelector('.player'); if (oldPlayer) oldPlayer.remove();
        const oldUpNext = playerViewContainer.querySelector('#up-next-list-container'); if (oldUpNext) oldUpNext.remove();
        const playerDiv = createPlayerElement(track, songId, false); playerDiv.classList.add('player-loading');
        playerViewContainer.insertBefore(playerDiv, playerViewContainer.firstChild);
        requestAnimationFrame(() => { requestAnimationFrame(() => { playerDiv.classList.remove('player-loading'); }); });
        initializeAudioForPlayer(playerDiv, triggeredByAutoplayNext);
        setMetaTags({ title: `${track.title} - Nekohacker591`, description: `Listen to "${track.title}" by Nekohacker591.`, url: window.location.href, type: 'music.song', audioUrl: track.file, imageUrl: track.artwork || defaultArtwork, trackIdForEmbed: songId });
        pageTitleElement.style.display = 'none';
        populateUpNextList(songId, playerViewContainer);
    } else if (view === 'music') {
        musicContent.classList.add('active');
        const musicNavLink = document.querySelector('#page-wrapper .nav-link[data-view="music"]');
        if (musicNavLink) musicNavLink.classList.add('active');
        const currentSearch = searchQuery || '';
        if(musicSearchInput) musicSearchInput.value = currentSearch.replace(/\+/g, ' ');
        const filtered = songsData.filter(t => t.title.toLowerCase().includes(currentSearch.toLowerCase()));
        populateSongList(filtered); setMetaTags({ title: 'Music - Nekohacker591 Portfolio' });
    } else {
        homeContent.classList.add('active');
        const homeNavLink = document.querySelector('#page-wrapper .nav-link[data-view="home"]');
        if(homeNavLink) homeNavLink.classList.add('active');
        setMetaTags();
    }
}

// *** THIS IS THE MAIN LOGIC WRAPPER ***
// Everything waits until the songs.json is loaded.
document.addEventListener('DOMContentLoaded', () => {
    fetch('songs.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Fucking hell, the network response was not ok. Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            songsData = data; // Load the song data into our variable
            initializeApp(); // Now, run the rest of the app
        })
        .catch(error => {
            console.error("Fatal Error: Could not load or parse songs.json.", error);
            const loadingOverlay = document.getElementById('loading-overlay');
            if(loadingOverlay) loadingOverlay.innerHTML = `<div class="loading-text">ERROR LOADING SONGS</div>`;
        });
});

function initializeApp() {
    const pageWrapper = document.getElementById('page-wrapper');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // The rest of your original DOMContentLoaded logic goes here.
    const urlParamsForEmbed = new URLSearchParams(window.location.search);
    const embedIdParam = urlParamsForEmbed.get('embed');

    if (embedIdParam !== null && songsData[embedIdParam]) {
        if (loadingOverlay) loadingOverlay.remove();
        document.body.innerHTML = '';
        document.body.className = 'embed-mode';
        const track = songsData[embedIdParam];
        const playerDiv = createPlayerElement(track, parseInt(embedIdParam), true);
        document.body.appendChild(playerDiv);
        initializeAudioForPlayer(playerDiv, false);
        return;
    }

    if (!pageWrapper) {
        console.error("Required #page-wrapper element not found.");
        return;
    }

    sidebarToggleBtn = document.getElementById('sidebar-toggle');
    navLinks = document.querySelectorAll('#page-wrapper #sidebar .nav-link');
    tabContents = document.querySelectorAll('#page-wrapper .tab-content');
    songListUl = document.getElementById('song-list');
    musicSearchInput = document.getElementById('music-search-input');
    autoplayToggleBtnElement = document.getElementById('autoplay-toggle-btn');
    playerViewContainer = document.getElementById('player-view-content');
    homeContent = document.getElementById('home-content');
    musicContent = document.getElementById('music-content');
    pageTitleElement = document.getElementById('page-title');

    setupIcons();

    const storedAutoplay = localStorage.getItem('nekohacker_autoplayNext');
    globalPlayerState.autoplayNext = storedAutoplay !== null ? JSON.parse(storedAutoplay) : true; 

    if (autoplayToggleBtnElement) {
        autoplayToggleBtnElement.addEventListener('click', () => {
            globalPlayerState.autoplayNext = !globalPlayerState.autoplayNext;
            const currentSongIdParam = new URLSearchParams(window.location.search).get('songId');
            if (playerViewContainer && playerViewContainer.classList.contains('active') && currentSongIdParam !== null) {
                populateUpNextList(parseInt(currentSongIdParam), playerViewContainer);
            }
        });
    }
    
    renderView();

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
            updateSidebarToggleIcon();
        });
    }

    if (navLinks) {
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
            e.preventDefault(); const targetView = link.dataset.view; const url = new URL(window.location);
            const currentParams = new URLSearchParams(url.search); const currentView = currentParams.get('view') || 'home';
            if (targetView === currentView && !(targetView === 'player' && currentParams.get('songId') !== link.dataset.songId)) {
                    if (window.innerWidth < 769 && document.body.classList.contains('sidebar-open')) { document.body.classList.remove('sidebar-open'); updateSidebarToggleIcon(); } return;
            }
            if (targetView === 'home') { url.searchParams.delete('view'); url.searchParams.delete('s'); url.searchParams.delete('songId'); }
            else { url.searchParams.set('view', targetView); url.searchParams.delete('songId'); }
            window.history.pushState({ view: targetView }, '', url); renderView();
            if (window.innerWidth < 769 && document.body.classList.contains('sidebar-open')) { document.body.classList.remove('sidebar-open'); updateSidebarToggleIcon(); }
            });
        });
    }

    if (musicSearchInput) {
        musicSearchInput.addEventListener('input', () => {
            const query = musicSearchInput.value.toLowerCase(); const url = new URL(window.location);
            if (query) url.searchParams.set('s', query.replace(/ /g, '+')); else url.searchParams.delete('s');
            if (musicContent && musicContent.classList.contains('active')) { window.history.replaceState({ view: 'music', s: query }, '', url); renderView(); }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        let activeAudio = globalPlayerState.currentPlayingAudio; let activePlayerDiv = globalPlayerState.currentPlayingPlayerDiv;
        if (!activeAudio && playerViewContainer && playerViewContainer.classList.contains('active')) { activePlayerDiv = playerViewContainer.querySelector('.player'); if (activePlayerDiv && activePlayerDiv.audio) activeAudio = activePlayerDiv.audio; }
        const playButton = activePlayerDiv ? activePlayerDiv.querySelector('.play-btn') : null;
        const muteButton = activePlayerDiv ? activePlayerDiv.querySelector('.mute-btn') : null;
        if (e.code === 'Space') { e.preventDefault(); if (playButton) playButton.click(); }
        else if (e.code === 'KeyM') { e.preventDefault(); if (muteButton) muteButton.click(); }
        else if (activeAudio && activePlayerDiv) {
            let handled = false; const cT = activeAudio.currentTime, dur = activeAudio.duration, vol = activeAudio.volume;
            if(e.code==='ArrowLeft'){if(dur&&dur!==Infinity)activeAudio.currentTime=Math.max(0,cT-5);handled=true;}
            else if(e.code==='ArrowRight'){if(dur&&dur!==Infinity)activeAudio.currentTime=Math.min(dur,cT+5);handled=true;}
            else if(e.code==='ArrowUp'){activeAudio.muted=false;activeAudio.volume=Math.min(1,vol+0.05);handled=true;}
            else if(e.code==='ArrowDown'){activeAudio.muted=false;activeAudio.volume=Math.max(0,vol-0.05);handled=true;}
            if(handled)e.preventDefault();
        }
    });

    window.addEventListener('popstate', () => renderView());

    // Fade out loading screen and fade in the page
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        loadingOverlay.addEventListener('transitionend', function handleTransitionEnd(event) {
            if (event.propertyName === 'opacity') {
                loadingOverlay.remove();
            }
        });
    }

    pageWrapper.style.display = 'flex';
    requestAnimationFrame(() => {
        pageWrapper.classList.add('visible');
    });
}