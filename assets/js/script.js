(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const state = window.plugencyDevHelp || {};
        const launcher = document.getElementById('plugencyDebugLauncher');
        const panel = document.getElementById('plugencyDebugPanel');
        const tabs = panel ? panel.querySelectorAll('[data-tab]') : [];
        const sections = panel ? panel.querySelectorAll('[data-section]') : [];
        const statusBar = panel ? panel.querySelector('[data-role="status"]') : null;
        const debugStatus = document.getElementById('debugLogStatus');
        const queryStatus = document.getElementById('queryToggleMsg');
        const debugLog = panel ? panel.querySelector('[data-role="debug-log"] pre') : null;
        const snapshotNode = document.getElementById('plugencyDebugSnapshot');
        const toggleDebugBtn = panel ? panel.querySelector('[data-action="toggle-debug"]') : null;
        const toggleQueryBtn = panel ? panel.querySelector('[data-action="toggle-query-log"]') : null;
        const refreshLogBtn = panel ? panel.querySelector('[data-action="refresh-log"]') : null;
        const clearLogBtn = panel ? panel.querySelector('[data-action="clear-log"]') : null;
        const liveTailBtn = panel ? panel.querySelector('[data-action="live-tail"]') : null;
        const copyMatchesBtn = panel ? panel.querySelector('[data-action="copy-matches"]') : null;
        const logLinesInput = panel ? panel.querySelector('[data-role="log-lines"]') : null;
        const logLinesValue = panel ? panel.querySelector('[data-role="log-lines-value"]') : null;
        const logQueryInput = panel ? panel.querySelector('[data-role="log-query"]') : null;
        const testLogBtn = panel ? panel.querySelector('[data-action="write-test-log"]') : null;
        const copySnapshotBtn = panel ? panel.querySelector('[data-action="copy-snapshot"]') : null;
        const downloadSnapshotBtn = panel ? panel.querySelector('[data-action="download-snapshot"]') : null;
        const copyCurlBtn = panel ? panel.querySelector('[data-action="copy-curl"]') : null;
        const replayBtn = panel ? panel.querySelector('[data-action="replay-request"]') : null;
        const replayOutput = panel ? panel.querySelector('#plugencyReplayOutput pre') : null;
        const replayStatus = panel ? panel.querySelector('#plugencyReplayStatus') : null;
        const replayTimeoutInput = panel ? panel.querySelector('[data-role="replay-timeout"]') : null;
        const requestMenu = panel ? panel.querySelector('[data-role="request-menu"]') : null;
        const requestMenuToggle = panel ? panel.querySelector('[data-action="toggle-request-menu"]') : null;
        const performanceSection = panel ? panel.querySelector('[data-section="performance"]') : null;
        const closeBtn = panel ? panel.querySelector('[data-action="close-panel"]') : null;

        if (!launcher || !panel) {
            return;
        }

        const setStatus = (message, type = 'info') => {
            if (!statusBar) {
                return;
            }
            statusBar.textContent = message;
            statusBar.className = `plugency-feedback ${type}`;
        };

        const extractError = (payload) => {
            if (!payload) {
                return 'Request failed';
            }
            if (typeof payload === 'string') {
                return payload;
            }
            if (payload.data) {
                if (typeof payload.data === 'string') {
                    return payload.data;
                }
                if (payload.data.error) {
                    return payload.data.error;
                }
            }
            if (payload.error) {
                return payload.error;
            }
            return 'Request failed';
        };

        const post = (action, payload = {}) => {
            const body = new URLSearchParams();
            body.append('action', action);
            body.append('nonce', state.nonce || '');
            Object.entries(payload).forEach(([key, value]) => body.append(key, value));

            return fetch(state.ajaxUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            }).then(async (response) => {
                const json = await response.json().catch(() => null);
                if (!response.ok || !json || json.success === false) {
                    throw new Error(extractError(json));
                }
                return json.data;
            });
        };

        const togglePanel = () => {
            panel.classList.toggle('open');
            updateInspectorToolbarVisibility();
        };

        const closePanel = () => {
            panel.classList.remove('open');
            stopLiveTail();
            updateInspectorToolbarVisibility();
        };

        const switchTab = (target) => {
            const id = target.getAttribute('data-tab');
            tabs.forEach((tab) => {
                tab.classList.toggle('active', tab === target);
                tab.setAttribute('aria-selected', tab === target ? 'true' : 'false');
            });
            sections.forEach((section) => {
                section.classList.toggle('active', section.getAttribute('data-section') === id);
            });
        };

        const copyText = (text) => navigator.clipboard.writeText(text)
            .then(() => setStatus('Copied to clipboard', 'success'))
            .catch(() => setStatus('Copy failed', 'error'));

        let liveTailTimer = null;
        let lastLogData = null;

        const getLogParams = () => {
            const lines = logLinesInput && logLinesInput.value ? parseInt(logLinesInput.value, 10) : 250;
            const query = logQueryInput ? logQueryInput.value.trim() : '';
            return {
                lines: Number.isFinite(lines) ? lines : 250,
                query,
            };
        };

        const renderLog = (data) => {
            if (!debugLog || !data) {
                return;
            }
            lastLogData = data;
            const content = data.query && data.filtered !== undefined ? data.filtered : data.content;
            debugLog.textContent = content;
            if (debugStatus) {
                const matches = typeof data.matches !== 'undefined' ? data.matches : (content ? content.split('\n').length : 0);
                debugStatus.textContent = `Showing ${matches} line(s) of ${data.lines || 0} (limit ${data.limit || 0})` + (data.query ? ` for "${data.query}"` : '');
            }
        };

        const copyBlock = (targetId) => {
            const block = document.getElementById(targetId);
            if (!block) {
                setStatus('Nothing to copy for this block.', 'error');
                return;
            }
            copyText(block.innerText);
        };

        const copySnapshot = () => {
            if (!snapshotNode) {
                setStatus('Snapshot not found.', 'error');
                return;
            }
            copyText(snapshotNode.textContent.trim());
        };

        const downloadSnapshot = () => {
            if (!snapshotNode) {
                setStatus('Snapshot not found.', 'error');
                return;
            }
            const content = snapshotNode.textContent.trim();
            if (!content) {
                setStatus('Snapshot is empty.', 'error');
                return;
            }
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = url;
            link.download = `plugency-snapshot-${stamp}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus('Snapshot downloaded.', 'success');
        };

        const updateDebugToggleLabel = () => {
            if (!toggleDebugBtn) {
                return;
            }
            const enabled = !!state.debugLoggingEnabled;
            toggleDebugBtn.textContent = enabled ? 'Disable debug logging' : 'Enable debug logging';
            toggleDebugBtn.dataset.state = enabled ? 'on' : 'off';
        };

        const updateQueryToggleLabel = () => {
            if (!toggleQueryBtn) {
                return;
            }
            const enabled = !!state.queryLoggingEnabled;
            toggleQueryBtn.textContent = enabled ? 'Disable query logging' : 'Enable query logging';
            toggleQueryBtn.dataset.state = enabled ? 'on' : 'off';
        };

        const refreshDebugLog = () => {
            if (!debugLog) {
                return;
            }
            const params = getLogParams();
            setStatus('Refreshing debug log...', 'info');
            post('plugency_refresh_debug_log', params)
                .then((data) => {
                    data.query = params.query;
                    renderLog(data);
                    setStatus('Debug log refreshed.', 'success');
                })
                .catch((error) => setStatus(error.message, 'error'));
        };

        const clearDebugLog = () => {
            if (!window.confirm('Clear the debug log?')) {
                return;
            }
            setStatus('Clearing debug log...', 'info');
            post('delete_debug_file')
                .then((data) => {
                    if (debugLog) {
                        debugLog.textContent = 'Debug file not found or unreadable.';
                    }
                    if (debugStatus) {
                        debugStatus.textContent = data || 'Debug file cleared.';
                    }
                    setStatus('Debug log cleared.', 'success');
                })
                .catch((error) => setStatus(error.message, 'error'));
        };

        const toggleDebugLog = () => {
            const next = state.debugLoggingEnabled ? 'off' : 'on';
            setStatus(`${next === 'on' ? 'Enabling' : 'Disabling'} debug log...`, 'info');
            post('toggle_debug_log', { status: next })
                .then((data) => {
                    state.debugLoggingEnabled = next === 'on';
                    if (debugStatus) {
                        debugStatus.textContent = data && data.message ? data.message : '';
                    }
                    updateDebugToggleLabel();
                    refreshDebugLog();
                    setStatus('Debug log state updated.', 'success');
                })
                .catch((error) => setStatus(error.message, 'error'));
        };

        const toggleQueryLogging = () => {
            const next = state.queryLoggingEnabled ? 'off' : 'on';
            setStatus(`${next === 'on' ? 'Enabling' : 'Disabling'} query logging...`, 'info');
            post('toggle_query_logging', { status: next })
                .then((data) => {
                    state.queryLoggingEnabled = next === 'on';
                    if (queryStatus) {
                        queryStatus.textContent = data && data.message ? data.message : '';
                    }
                    updateQueryToggleLabel();
                    setStatus('Query logging state updated.', 'success');
                })
                .catch((error) => setStatus(error.message, 'error'));
        };

        const stopLiveTail = () => {
            if (liveTailTimer) {
                clearInterval(liveTailTimer);
                liveTailTimer = null;
            }
            if (liveTailBtn) {
                liveTailBtn.textContent = 'Start live tail';
            }
        };

        const startLiveTail = () => {
            refreshDebugLog();
            if (liveTailTimer) {
                return;
            }
            liveTailTimer = setInterval(refreshDebugLog, 4000);
            if (liveTailBtn) {
                liveTailBtn.textContent = 'Stop live tail';
            }
        };

        const toggleLiveTail = () => {
            if (liveTailTimer) {
                stopLiveTail();
                setStatus('Live tail stopped.', 'info');
            } else {
                startLiveTail();
                setStatus('Live tail started.', 'info');
            }
        };

        const copyMatches = () => {
            const params = getLogParams();
            const payload = lastLogData && params.query ? lastLogData.filtered : (lastLogData ? lastLogData.content : null);
            if (payload) {
                copyText(payload);
                setStatus('Matches copied.', 'success');
                return;
            }
            // fetch first if nothing cached
            refreshDebugLog();
            setTimeout(() => {
                if (lastLogData) {
                    const content = params.query ? lastLogData.filtered : lastLogData.content;
                    copyText(content || '');
                }
            }, 300);
        };

        const writeTestLog = () => {
            setStatus('Writing test log entry...', 'info');
            post('plugency_write_test_log')
                .then((data) => {
                    const msg = data && data.message ? data.message : 'Test log written.';
                    setStatus(msg, 'success');
                    refreshDebugLog();
                })
                .catch((error) => setStatus(error.message, 'error'));
        };

        launcher.addEventListener('click', togglePanel);
        if (closeBtn) {
            closeBtn.addEventListener('click', closePanel);
        }

        document.addEventListener('click', (event) => {
            if (!panel.contains(event.target) && !launcher.contains(event.target)) {
                closePanel();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePanel();
            }
        });

        tabs.forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                switchTab(tab);
            });
        });

        const filterPanel = panel.querySelector('[data-role="filter-panel"]');
        const filterOpen = panel.querySelector('[data-action="open-filter"]');
        const filterClose = filterPanel ? filterPanel.querySelector('[data-action="close-filter"]') : null;
        const filterApply = filterPanel ? filterPanel.querySelector('[data-action="apply-filter"]') : null;
        const filterClear = filterPanel ? filterPanel.querySelector('[data-action="clear-filter"]') : null;
        const inspectBtn = panel.querySelector('[data-action="start-inspect"]');
        const toolsBar = document.querySelector('[data-role="inspect-tools"]');
        const snapshotScript = document.getElementById('plugencyDebugSnapshot');
        let snapshotData = {};
        if (snapshotScript) {
            try {
                snapshotData = JSON.parse(snapshotScript.textContent);
            } catch (e) {
                snapshotData = {};
            }
        }
        let inspector = null;
        const popups = [];

        const escapeShell = (str) => String(str).replace(/'/g, '\'\"\'\"\'');
        const buildCurlCommand = () => {
            const request = snapshotData && snapshotData.summary ? snapshotData.summary.request : null;
            if (!request || !request.url) {
                return '';
            }
            const method = (request.method || 'GET').toUpperCase();
            const url = request.url;
            const postData = snapshotData.requests && snapshotData.requests.POST ? snapshotData.requests.POST : {};
            const hasBody = method !== 'GET' && postData && Object.keys(postData).length > 0;

            const parts = [`curl -X ${method}`];
            parts.push(`\"${url}\"`);

            if (hasBody) {
                const params = new URLSearchParams();
                Object.entries(postData).forEach(([key, value]) => {
                    params.append(key, value);
                });
                const body = params.toString();
                parts.push(`-H \"Content-Type: application/x-www-form-urlencoded\"`);
                parts.push(`--data '${escapeShell(body)}'`);
            }

            return parts.join(' \\\n  ');
        };

        const copyCurl = () => {
            const command = buildCurlCommand();
            if (!command) {
                setStatus('Unable to build cURL command for this request.', 'error');
                return;
            }
            copyText(command);
        };

        const setReplayMessage = (message, type = 'info') => {
            if (replayStatus) {
                replayStatus.textContent = message;
                replayStatus.className = `plugency-status ${type}`;
            }
        };

        const closeRequestMenu = () => {
            if (requestMenu && requestMenuToggle) {
                requestMenu.classList.remove('open');
                requestMenuToggle.setAttribute('aria-expanded', 'false');
            }
        };

        const toggleRequestMenu = (event) => {
            if (!requestMenu || !requestMenuToggle) {
                return;
            }
            event.stopPropagation();
            const isOpen = requestMenu.classList.toggle('open');
            requestMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        };

        const initPerformanceTab = () => {
            if (!performanceSection) {
                return;
            }

            const perfDom = performanceSection.querySelector('[data-role="perf-dom"]');
            const perfLoad = performanceSection.querySelector('[data-role="perf-load"]');
            const perfTtfb = performanceSection.querySelector('[data-role="perf-ttfb"]');
            const perfTransfer = performanceSection.querySelector('[data-role="perf-transfer"]');
            const perfBadge = performanceSection.querySelector('[data-role="perf-badge"]');
            const perfNote = performanceSection.querySelector('[data-role="perf-note"]');
            const perfOppsList = performanceSection.querySelector('[data-role="perf-opps"]');
            const perfOppsCount = performanceSection.querySelector('[data-role="perf-opps-count"]');
            const stylesList = performanceSection.querySelector('[data-role="perf-styles-list"]');
            const stylesMeta = performanceSection.querySelector('[data-role="perf-styles-meta"]');
            const scriptsList = performanceSection.querySelector('[data-role="perf-scripts-list"]');
            const scriptsMeta = performanceSection.querySelector('[data-role="perf-scripts-meta"]');
            const imagesList = performanceSection.querySelector('[data-role="perf-images-list"]');
            const imagesMeta = performanceSection.querySelector('[data-role="perf-images-meta"]');
            const metricsList = performanceSection.querySelector('[data-role="perf-metrics-list"]');
            const metricsMeta = performanceSection.querySelector('[data-role="perf-metrics-meta"]');
            const accordionTriggers = performanceSection.querySelectorAll('.plugency-accordion-trigger');

            const formatMs = (val) => {
                if (typeof val !== 'number' || Number.isNaN(val) || val < 0) {
                    return 'n/a';
                }
                if (val >= 1000) {
                    return `${(val / 1000).toFixed(2)} s`;
                }
                return `${Math.round(val)} ms`;
            };

            const formatBytes = (val) => {
                if (typeof val !== 'number' || Number.isNaN(val) || val <= 0) {
                    return '0 B';
                }
                if (val >= 1024 * 1024) {
                    return `${(val / (1024 * 1024)).toFixed(1)} MB`;
                }
                if (val >= 1024) {
                    return `${(val / 1024).toFixed(1)} KB`;
                }
                return `${Math.round(val)} B`;
            };

            const normalizeKey = (url) => {
                if (!url) {
                    return '';
                }
                try {
                    return new URL(url, window.location.href).href.split('#')[0];
                } catch (e) {
                    return (url || '').split('#')[0];
                }
            };

            const guessType = (url) => {
                const lower = (url || '').toLowerCase();
                const match = lower.match(/\.([a-z0-9]+)(?:\?|$)/);
                return match ? match[1] : 'unknown';
            };

            const getResourceEntries = () => {
                if (typeof performance === 'undefined' || !performance.getEntriesByType) {
                    return [];
                }
                return performance.getEntriesByType('resource') || [];
            };

            const buildResourceIndex = (entries) => {
                const index = new Map();
                entries.forEach((entry) => {
                    if (!entry || !entry.name) {
                        return;
                    }
                    const key = normalizeKey(entry.name);
                    if (key) {
                        index.set(key, entry);
                        const noQuery = key.split('?')[0];
                        if (noQuery && !index.has(noQuery)) {
                            index.set(noQuery, entry);
                        }
                    }
                });
                return index;
            };

            const getResourceBySrc = (src, index) => {
                if (!src || !index) {
                    return null;
                }
                const key = normalizeKey(src);
                if (index.has(key)) {
                    return index.get(key);
                }
                const noQuery = key.split('?')[0];
                if (index.has(noQuery)) {
                    return index.get(noQuery);
                }
                return null;
            };

            const collectNavigationMetrics = () => {
                if (typeof performance === 'undefined') {
                    return {};
                }
                const navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
                if (navEntry) {
                    return {
                        domContentLoaded: navEntry.domContentLoadedEventEnd,
                        load: navEntry.loadEventEnd,
                        ttfb: navEntry.responseStart,
                        transfer: navEntry.transferSize || navEntry.decodedBodySize || navEntry.encodedBodySize || 0,
                    };
                }
                const timing = performance.timing;
                if (timing && timing.responseEnd) {
                    return {
                        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
                        load: timing.loadEventEnd - timing.navigationStart,
                        ttfb: timing.responseStart - timing.navigationStart,
                        transfer: 0,
                    };
                }
                return {};
            };

            const summarizeResources = (entries) => {
                const summary = {
                    totalCount: 0,
                    totalTransfer: 0,
                    css: { count: 0, transfer: 0 },
                    js: { count: 0, transfer: 0 },
                    img: { count: 0, transfer: 0 },
                    font: { count: 0, transfer: 0 },
                    other: { count: 0, transfer: 0 },
                    externalCount: 0,
                    externalTransfer: 0,
                };
                const host = window.location.host;
                entries.forEach((entry) => {
                    if (!entry || !entry.name) {
                        return;
                    }
                    const type = (entry.initiatorType || '').toLowerCase();
                    const bytes = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    summary.totalCount += 1;
                    summary.totalTransfer += bytes;
                    const target = (() => {
                        if (['link', 'css', 'style'].includes(type)) {
                            return 'css';
                        }
                        if (type === 'script' || type === 'xmlhttprequest' || type === 'fetch') {
                            return 'js';
                        }
                        if (type === 'img' || type === 'image') {
                            return 'img';
                        }
                        if (type === 'font') {
                            return 'font';
                        }
                        if (entry.name && /\.(woff2?|ttf|otf)(\?|$)/.test(entry.name.toLowerCase())) {
                            return 'font';
                        }
                        return 'other';
                    })();
                    summary[target].count += 1;
                    summary[target].transfer += bytes;
                    const entryHost = (() => {
                        try {
                            return new URL(entry.name).host;
                        } catch (e) {
                            return '';
                        }
                    })();
                    if (entryHost && host && entryHost !== host) {
                        summary.externalCount += 1;
                        summary.externalTransfer += bytes;
                    }
                });
                return summary;
            };

            const mapAssetsToUsage = (assets, resourceIndex) => {
                return (Array.isArray(assets) ? assets : []).map((asset) => {
                    const src = asset && asset.src ? asset.src : '';
                    const resource = getResourceBySrc(src, resourceIndex);
                    const status = src ? (resource ? 'loaded' : 'not-requested') : 'inline';
                    const transfer = resource ? (resource.transferSize || resource.decodedBodySize || resource.encodedBodySize || 0) : (asset && asset.bytes ? asset.bytes : 0);
                    const duration = resource ? resource.duration : (asset && asset.fetch_ms ? asset.fetch_ms : null);
                    let host = '';
                    if (src) {
                        try {
                            host = new URL(src, window.location.href).host;
                        } catch (e) {
                            host = '';
                        }
                    }
                    return {
                        name: asset && asset.handle ? asset.handle : 'unknown',
                        src,
                        transfer,
                        duration,
                        status,
                        host,
                        category: asset && (asset.category_label || asset.category) ? (asset.category_label || asset.category) : '',
                    };
                });
            };

            const collectImages = (resourceIndex) => {
                const nodes = Array.from(document.images || []);
                const map = new Map();
                nodes.forEach((img) => {
                    const src = img.currentSrc || img.src || '';
                    if (!src) {
                        return;
                    }
                    const key = normalizeKey(src);
                    const rect = img.getBoundingClientRect();
                    const existing = map.get(key) || {
                        src,
                        count: 0,
                        renderedWidth: 0,
                        renderedHeight: 0,
                        naturalWidth: 0,
                        naturalHeight: 0,
                        transfer: null,
                        duration: null,
                        type: guessType(src),
                        sample: img,
                    };
                    existing.count += 1;
                    existing.renderedWidth = Math.max(existing.renderedWidth, Math.round(rect.width));
                    existing.renderedHeight = Math.max(existing.renderedHeight, Math.round(rect.height));
                    existing.naturalWidth = Math.max(existing.naturalWidth, img.naturalWidth || 0);
                    existing.naturalHeight = Math.max(existing.naturalHeight, img.naturalHeight || 0);
                    const resource = getResourceBySrc(src, resourceIndex);
                    if (resource && (existing.transfer === null || existing.transfer === 0)) {
                        existing.transfer = resource.transferSize || resource.decodedBodySize || resource.encodedBodySize || 0;
                        existing.duration = resource.duration || null;
                    }
                    map.set(key, existing);
                });
                return Array.from(map.values());
            };

            const renderList = (container, items, emptyLabel) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = emptyLabel;
                    row.appendChild(text);
                    container.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = item.name || item.src || 'Unknown';
                    row.appendChild(title);
                    if (item.src) {
                        const src = document.createElement('span');
                        src.className = 'plugency-source';
                        src.textContent = item.src;
                        row.appendChild(src);
                    }
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const parts = [];
                    if (item.transfer !== null && typeof item.transfer !== 'undefined') {
                        parts.push(formatBytes(item.transfer));
                    }
                    if (item.duration) {
                        parts.push(formatMs(item.duration));
                    }
                    if (item.host) {
                        parts.push(item.host);
                    }
                    meta.textContent = parts.filter(Boolean).join(' | ');
                    row.appendChild(meta);
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    if (item.status === 'loaded') {
                        pill.classList.add('success');
                        pill.textContent = 'Loaded';
                    } else if (item.status === 'not-requested') {
                        pill.classList.add('warn');
                        pill.textContent = 'Not requested';
                    } else {
                        pill.textContent = 'Inline/unknown';
                    }
                    row.appendChild(pill);
                    container.appendChild(row);
                });
            };

            const renderImages = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No images found on this view.';
                    row.appendChild(text);
                    container.appendChild(row);
                    return;
                }
                items.forEach((img) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const thumb = document.createElement('img');
                    thumb.className = 'plugency-thumb';
                    thumb.src = img.src;
                    thumb.alt = '';
                    thumb.loading = 'lazy';
                    row.appendChild(thumb);
                    const info = document.createElement('div');
                    info.className = 'plugency-path';
                    info.textContent = img.src;
                    row.appendChild(info);
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const dims = `${img.renderedWidth || 0}x${img.renderedHeight || 0}px rendered | natural ${img.naturalWidth || 0}x${img.naturalHeight || 0}px`;
                    const parts = [dims, img.type ? img.type.toUpperCase() : 'Unknown', `${img.count} use${img.count === 1 ? '' : 's'}`];
                    if (img.transfer) {
                        parts.push(formatBytes(img.transfer));
                    }
                    meta.textContent = parts.filter(Boolean).join(' | ');
                    row.appendChild(meta);
                    container.appendChild(row);
                });
            };

            const renderMetrics = (container, summary) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                const rows = [
                    { label: 'CSS', value: `${summary.css.count} requests | ${formatBytes(summary.css.transfer)}` },
                    { label: 'JS', value: `${summary.js.count} requests | ${formatBytes(summary.js.transfer)}` },
                    { label: 'Images', value: `${summary.img.count} requests | ${formatBytes(summary.img.transfer)}` },
                    { label: 'Fonts', value: `${summary.font.count} requests | ${formatBytes(summary.font.transfer)}` },
                    { label: 'External', value: `${summary.externalCount} | ${formatBytes(summary.externalTransfer)}` },
                    { label: 'Total', value: `${summary.totalCount} | ${formatBytes(summary.totalTransfer)}` },
                ];
                rows.forEach((rowData) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('span');
                    label.className = 'plugency-path';
                    label.textContent = rowData.label;
                    const value = document.createElement('span');
                    value.className = 'plugency-accordion-meta';
                    value.textContent = rowData.value;
                    row.appendChild(label);
                    row.appendChild(value);
                    container.appendChild(row);
                });
            };

            const buildFindings = (styleUsage, scriptUsage, images, summary) => {
                const findings = [];
                const unusedStyles = styleUsage.filter((item) => item.status === 'not-requested');
                const unusedScripts = scriptUsage.filter((item) => item.status === 'not-requested');
                const heavyImages = images.filter((img) => (img.transfer || 0) > 350000 || img.naturalWidth > 2000 || img.naturalHeight > 2000);
                if (unusedStyles.length) {
                    findings.push({ text: `${unusedStyles.length} enqueued styles were not requested on this view.`, tone: 'warn' });
                }
                if (unusedScripts.length) {
                    findings.push({ text: `${unusedScripts.length} enqueued scripts were not requested on this view.`, tone: 'warn' });
                }
                if (summary.js.transfer > 750000) {
                    findings.push({ text: `JavaScript transfer is heavy (${formatBytes(summary.js.transfer)}). Consider deferring or splitting bundles.`, tone: 'warn' });
                }
                if (summary.css.transfer > 300000) {
                    findings.push({ text: `CSS transfer is high (${formatBytes(summary.css.transfer)}). Unused CSS may be blocking render.`, tone: 'warn' });
                }
                if (heavyImages.length) {
                    findings.push({ text: `${heavyImages.length} large image${heavyImages.length === 1 ? '' : 's'} detected. Optimise or lazy-load to improve speed.`, tone: 'error' });
                }
                if (summary.externalCount > 6) {
                    findings.push({ text: `High external request count (${summary.externalCount}). Third-party tags can slow the page.`, tone: 'warn' });
                }
                if (!findings.length) {
                    findings.push({ text: 'No obvious performance issues detected in this view.', tone: 'success' });
                }
                return findings;
            };

            const renderFindings = (items) => {
                if (!perfOppsList || !perfOppsCount) {
                    return;
                }
                perfOppsList.innerHTML = '';
                perfOppsCount.textContent = `${items.length} finding${items.length === 1 ? '' : 's'}`;
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = item.text;
                    row.appendChild(text);
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    if (item.tone === 'error') {
                        pill.classList.add('error');
                        pill.textContent = 'Action';
                    } else if (item.tone === 'warn') {
                        pill.classList.add('warn');
                        pill.textContent = 'Check';
                    } else {
                        pill.classList.add('success');
                        pill.textContent = 'Healthy';
                    }
                    row.appendChild(pill);
                    perfOppsList.appendChild(row);
                });
            };

            const renderSummary = (navMetrics, resourceSummary) => {
                if (perfDom) {
                    perfDom.textContent = navMetrics.domContentLoaded ? formatMs(navMetrics.domContentLoaded) : 'n/a';
                }
                if (perfLoad) {
                    perfLoad.textContent = navMetrics.load ? formatMs(navMetrics.load) : 'n/a';
                }
                if (perfTtfb) {
                    perfTtfb.textContent = navMetrics.ttfb ? formatMs(navMetrics.ttfb) : 'n/a';
                }
                if (perfTransfer) {
                    const transferVal = navMetrics.transfer || resourceSummary.totalTransfer || 0;
                    perfTransfer.textContent = formatBytes(transferVal);
                }
                if (perfBadge) {
                    perfBadge.textContent = 'Front-end';
                }
                if (perfNote && (!navMetrics.transfer || navMetrics.transfer === 0)) {
                    perfNote.textContent = 'Metrics may read 0B if served from cache or blocked by the browser.';
                }
            };

            const populate = () => {
                const entries = getResourceEntries();
                const resourceIndex = buildResourceIndex(entries);
                const navMetrics = collectNavigationMetrics();
                const summary = summarizeResources(entries);
                const styleUsage = mapAssetsToUsage(snapshotData.styles || [], resourceIndex);
                const scriptUsage = mapAssetsToUsage(snapshotData.scripts || [], resourceIndex);
                const imageData = collectImages(resourceIndex);
                renderSummary(navMetrics, summary);
                renderList(stylesList, styleUsage, 'No styles enqueued on this view.');
                renderList(scriptsList, scriptUsage, 'No scripts enqueued on this view.');
                renderImages(imagesList, imageData);
                renderMetrics(metricsList, summary);
                if (stylesMeta) {
                    const loadedStyles = styleUsage.filter((item) => item.status === 'loaded').length;
                    stylesMeta.textContent = `${loadedStyles}/${styleUsage.length} loaded`;
                }
                if (scriptsMeta) {
                    const loadedScripts = scriptUsage.filter((item) => item.status === 'loaded').length;
                    scriptsMeta.textContent = `${loadedScripts}/${scriptUsage.length} loaded`;
                }
                if (imagesMeta) {
                    imagesMeta.textContent = `${imageData.length} assets`;
                }
                if (metricsMeta) {
                    metricsMeta.textContent = `${summary.totalCount} requests`;
                }
                renderFindings(buildFindings(styleUsage, scriptUsage, imageData, summary));
            };

            accordionTriggers.forEach((trigger) => {
                trigger.addEventListener('click', () => {
                    const item = trigger.closest('.plugency-accordion-item');
                    if (!item) {
                        return;
                    }
                    const isOpen = item.classList.toggle('open');
                    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                });
            });

            populate();
            window.addEventListener('load', () => {
                setTimeout(populate, 300);
            });
        };

        const replayRequest = () => {
            const request = snapshotData && snapshotData.summary ? snapshotData.summary.request : null;
            if (!request || !request.url) {
                setReplayMessage('No request URL available to replay.', 'error');
                return;
            }
            const timeoutVal = replayTimeoutInput && replayTimeoutInput.value ? parseInt(replayTimeoutInput.value, 10) : 30;
            const payload = {
                url: request.url,
                method: request.method || 'GET',
                headers: JSON.stringify(snapshotData.requests && snapshotData.requests.HEADERS ? snapshotData.requests.HEADERS : {}),
                body: JSON.stringify(snapshotData.requests && snapshotData.requests.POST ? snapshotData.requests.POST : {}),
                timeout: Number.isFinite(timeoutVal) ? timeoutVal : 30,
            };
            setReplayMessage('Replaying request...', 'info');
            setStatus('Sending replay request...', 'info');
            post('plugency_replay_request', payload)
                .then((data) => {
                    const elapsedValue = typeof data.elapsed === 'number' ? data.elapsed : parseFloat(data.elapsed || 0);
                    const display = {
                        status: data.status || 0,
                        elapsed: elapsedValue ? `${elapsedValue.toFixed(3)}s` : 'n/a',
                        headers: data.headers || {},
                        body_preview: data.body_preview || '',
                        body_length: typeof data.body_length !== 'undefined' ? data.body_length : 0,
                        truncated: !!data.truncated,
                        error: data.error || null,
                        error_code: data.error_code || null,
                        timeout_used: data.timeout_used || timeoutVal || null,
                    };
                    if (replayOutput) {
                        replayOutput.textContent = JSON.stringify(display, null, 2);
                    }
                    if (display.error) {
                        let msg = display.error_code ? `${display.error} (${display.error_code})` : display.error;
                        if (display.error && display.error.toLowerCase().includes('timed out')) {
                            const t = display.timeout_used ? `${display.timeout_used}s` : '';
                            msg = `Request timed out${t ? ` after ${t}` : ''}. Try a higher timeout or check connectivity.`;
                        }
                        setReplayMessage(msg, 'error');
                        setStatus(msg, 'error');
                    } else {
                        setReplayMessage(`Status ${display.status} in ${display.elapsed}`, 'success');
                        setStatus('Replay completed.', 'success');
                    }
                })
                .catch((error) => {
                    setReplayMessage(error.message, 'error');
                    setStatus(error.message, 'error');
                });
        };

        const readFilterSelection = () => {
            const categories = new Set();
            const sources = {};
            if (!filterPanel) {
                return { categories, sources };
            }
            filterPanel.querySelectorAll('input[type="checkbox"][data-filter-category]').forEach((input) => {
                if (input.checked) {
                    const cat = input.getAttribute('data-filter-category');
                    const src = input.getAttribute('data-filter-source') || '';
                    categories.add(cat);
                    if (!sources[cat]) {
                        sources[cat] = new Set();
                    }
                    if (src) {
                        sources[cat].add(src);
                    }
                }
            });
            return { categories, sources };
        };

        const applyFilters = () => {
            const selection = readFilterSelection();
            const groups = panel.querySelectorAll('.plugency-group[data-category]');
            groups.forEach((group) => {
                const groupCat = group.getAttribute('data-category');
                const items = group.querySelectorAll('.plugency-list-item');
                let anyVisible = false;
                items.forEach((item) => {
                    const itemCat = item.getAttribute('data-category');
                    const itemSource = item.getAttribute('data-source') || '';
                    let visible = true;
                    if (selection.categories.size > 0 && !selection.categories.has(itemCat)) {
                        visible = false;
                    }
                    if (visible && selection.sources[itemCat] && selection.sources[itemCat].size > 0 && !selection.sources[itemCat].has(itemSource)) {
                        visible = false;
                    }
                    item.style.display = visible ? '' : 'none';
                    if (visible) {
                        anyVisible = true;
                    }
                });
                group.style.display = anyVisible || (selection.categories.size === 0 || selection.categories.has(groupCat)) ? '' : 'none';
            });
        };

        if (filterOpen && filterPanel) {
            filterOpen.addEventListener('click', () => {
                filterPanel.classList.add('open');
            });
        }

        if (filterClose && filterPanel) {
            filterClose.addEventListener('click', () => {
                filterPanel.classList.remove('open');
            });
        }

        if (filterApply && filterPanel) {
            filterApply.addEventListener('click', () => {
                applyFilters();
                filterPanel.classList.remove('open');
            });
        }

        if (filterClear && filterPanel) {
            filterClear.addEventListener('click', () => {
                filterPanel.querySelectorAll('input[type="checkbox"][data-filter-category]').forEach((input) => {
                    input.checked = false;
                });
                applyFilters();
            });
        }

        const buildSelector = (el) => {
            if (!(el instanceof Element)) {
                return '';
            }
            const path = [];
            let node = el;
            while (node && node.nodeType === 1 && node !== document.body) {
                let selector = node.nodeName.toLowerCase();
                if (node.id) {
                    selector += `#${node.id}`;
                    path.unshift(selector);
                    break;
                }
                if (node.className) {
                    const classes = node.className.trim().split(/\s+/).filter(Boolean);
                    if (classes.length) {
                        selector += '.' + classes.join('.');
                    }
                }
                const siblingIndex = Array.from(node.parentNode.children).indexOf(node) + 1;
                selector += `:nth-child(${siblingIndex})`;
                path.unshift(selector);
                node = node.parentElement;
            }
            return path.join(' > ');
        };

        const collectComputedStyles = (el) => {
            const computed = window.getComputedStyle(el);
            const keys = [
                'display',
                'position',
                'zIndex',
                'color',
                'backgroundColor',
                'fontSize',
                'fontFamily',
                'fontWeight',
                'lineHeight',
                'margin',
                'padding',
                'border',
                'width',
                'height',
                'top',
                'left',
                'right',
                'bottom',
                'opacity',
            ];
            const out = {};
            keys.forEach((k) => {
                const cssKey = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
                out[cssKey] = computed[k] || computed.getPropertyValue(cssKey);
            });
            return out;
        };

        const collectElementInfo = (el) => {
            if (!(el instanceof Element)) {
                return null;
            }
            const rect = el.getBoundingClientRect();
            const attrs = {};
            Array.from(el.attributes).forEach((attr) => {
                if (attr.name.startsWith('data-') || attr.name.startsWith('aria-') || ['id', 'class', 'href', 'src', 'alt', 'title', 'role', 'type', 'name', 'value', 'action', 'method'].includes(attr.name)) {
                    attrs[attr.name] = attr.value;
                }
            });
            const dataset = Object.assign({}, el.dataset || {});
            const text = el.textContent ? el.textContent.trim().slice(0, 500) : '';
            const provNode = el.closest('[data-plugency-prov]');
            const provId = provNode ? provNode.getAttribute('data-plugency-prov') : '';
            const provData = provId && snapshotData && snapshotData.provenance ? snapshotData.provenance[provId] : null;

            return {
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                classes: (el.className || '').toString().trim().split(/\s+/).filter(Boolean),
                selector: buildSelector(el),
                role: el.getAttribute('role') || '',
                bounding: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                },
                attributes: attrs,
                dataset,
                text_excerpt: text,
                html_excerpt: el.innerHTML ? el.innerHTML.trim().slice(0, 500) : '',
                link: el.tagName.toLowerCase() === 'a' ? el.getAttribute('href') : '',
                form: el.closest('form') ? {
                    action: el.closest('form').getAttribute('action'),
                    method: el.closest('form').getAttribute('method'),
                } : null,
                styles: collectComputedStyles(el),
                provenance_id: provId,
                provenance: provData,
            };
        };

        const renderPopup = (info, target) => {
            if (!info || !target) {
                return;
            }
            const popup = document.createElement('div');
            popup.className = 'plugency-inspect-popup';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'plugency-button ghost';
            closeBtn.textContent = 'x';
            closeBtn.addEventListener('click', () => {
                popup.remove();
                const idx = popups.findIndex((p) => p.node === popup);
                if (idx >= 0) {
                    popups.splice(idx, 1);
                }
                updateInspectorToolbarVisibility();
            });
            const title = document.createElement('div');
            title.className = 'plugency-inspect-title';
            const titleText = document.createElement('span');
            titleText.textContent = info.selector || info.tag;
            const copyBtn = document.createElement('button');
            copyBtn.className = 'plugency-icon-button';
            copyBtn.type = 'button';
            copyBtn.textContent = 'Copy selector';
            copyBtn.title = 'Copy selector';
            copyBtn.addEventListener('click', () => {
                if (info.selector) {
                    navigator.clipboard.writeText(info.selector)
                        .then(() => setStatus('Selector copied', 'success'))
                        .catch(() => setStatus('Copy failed', 'error'));
                }
            });
            title.appendChild(titleText);
            title.appendChild(copyBtn);
            const pre = document.createElement('pre');
            pre.textContent = JSON.stringify(info, null, 2);
            popup.appendChild(closeBtn);
            popup.appendChild(title);
            popup.appendChild(pre);
            document.body.appendChild(popup);

            const place = () => {
                const rect = target.getBoundingClientRect();
                const popupRect = popup.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                let top = window.scrollY + rect.top - popupRect.height - 8;
                if (top < 8) {
                    top = window.scrollY + rect.bottom + 8;
                }
                let left = window.scrollX + rect.left;
                if (left + popupRect.width > viewportWidth - 8) {
                    left = viewportWidth - popupRect.width - 8;
                }
                if (left < 8) {
                    left = 8;
                }
                if (top + popupRect.height > window.scrollY + viewportHeight - 8) {
                    top = window.scrollY + viewportHeight - popupRect.height - 8;
                }
                popup.style.top = `${top}px`;
                popup.style.left = `${left}px`;
            };
            place();
            popups.push({ node: popup, target });
            updateInspectorToolbarVisibility();
        };

        const createOverlay = () => {
            const overlay = document.createElement('div');
            overlay.className = 'plugency-inspector-overlay';
            document.body.appendChild(overlay);
            return overlay;
        };

        const startInspector = () => {
            if (inspector && inspector.active) {
                return;
            }
            const overlay = createOverlay();
            const onMove = (e) => {
                const target = e.target.closest('body *');
                if (!target || panel.contains(target) || target === overlay) {
                    overlay.style.display = 'none';
                    return;
                }
                const rect = target.getBoundingClientRect();
                overlay.style.display = 'block';
                overlay.style.width = rect.width + 'px';
                overlay.style.height = rect.height + 'px';
                overlay.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
            };
            const stop = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('click', onClick, true);
                overlay.remove();
                inspector = null;
            };
            const onClick = (e) => {
                if (panel.contains(e.target)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const target = e.target.closest('body *');
                const info = collectElementInfo(target);
                renderPopup(info, target);
                setStatus('Element captured', 'success');
                stop();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('click', onClick, true);
            inspector = { active: true, stop };
            setStatus('Element inspector active. Click any element to capture.', 'info');
        };

        if (inspectBtn) {
            inspectBtn.addEventListener('click', startInspector);
        }

        const updateInspectorToolbarVisibility = () => {
            if (!toolsBar) {
                return;
            }
            const counter = toolsBar.querySelector('[data-role="popup-count"]');
            if (counter) {
                counter.textContent = `${popups.length} captured`;
            }
            const panelOpen = panel && panel.classList.contains('open');
            const shouldShow = popups.length > 0 && !panelOpen;
            toolsBar.style.display = shouldShow ? 'flex' : 'none';
        };

        const setPopupsVisible = (visible) => {
            popups.forEach((p) => {
                p.node.style.display = visible ? '' : 'none';
            });
            updateInspectorToolbarVisibility();
        };

        if (toolsBar) {
            const showBtn = toolsBar.querySelector('[data-action="show-popups"]');
            const hideBtn = toolsBar.querySelector('[data-action="hide-popups"]');
            const clearBtn = toolsBar.querySelector('[data-action="clear-popups"]');
            const inspectAgainBtn = toolsBar.querySelector('[data-action="start-inspect"]');
            if (showBtn) {
                showBtn.addEventListener('click', () => setPopupsVisible(true));
            }
            if (hideBtn) {
                hideBtn.addEventListener('click', () => setPopupsVisible(false));
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    popups.forEach((p) => p.node.remove());
                    popups.length = 0;
                    setPopupsVisible(false);
                });
            }
            if (inspectAgainBtn) {
                inspectAgainBtn.addEventListener('click', startInspector);
            }
            updateInspectorToolbarVisibility();
        }

        panel.querySelectorAll('[data-action="copy-block"]').forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.getAttribute('data-target');
                if (target) {
                    copyBlock(target);
                }
            });
        });

        if (requestMenu && requestMenuToggle) {
            requestMenuToggle.addEventListener('click', toggleRequestMenu);
            document.addEventListener('click', (event) => {
                if (!requestMenu.contains(event.target)) {
                    closeRequestMenu();
                }
            });
            const requestMenuItems = requestMenu.querySelector('.plugency-menu-items');
            if (requestMenuItems) {
                requestMenuItems.querySelectorAll('button').forEach((button) => {
                    button.addEventListener('click', closeRequestMenu);
                });
            }
        }

        initPerformanceTab();

        if (copySnapshotBtn) {
            copySnapshotBtn.addEventListener('click', copySnapshot);
        }

        if (downloadSnapshotBtn) {
            downloadSnapshotBtn.addEventListener('click', downloadSnapshot);
        }

        if (copyCurlBtn) {
            copyCurlBtn.addEventListener('click', copyCurl);
        }

        if (replayBtn) {
            replayBtn.addEventListener('click', replayRequest);
        }

        if (refreshLogBtn) {
            refreshLogBtn.addEventListener('click', refreshDebugLog);
        }

        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', clearDebugLog);
        }

        if (liveTailBtn) {
            liveTailBtn.addEventListener('click', toggleLiveTail);
        }

        if (copyMatchesBtn) {
            copyMatchesBtn.addEventListener('click', copyMatches);
        }

        if (logLinesInput && logLinesValue) {
            logLinesValue.textContent = logLinesInput.value;
            logLinesInput.addEventListener('input', () => {
                logLinesValue.textContent = logLinesInput.value;
                if (liveTailTimer) {
                    refreshDebugLog();
                }
            });
        }

        if (logQueryInput) {
            logQueryInput.addEventListener('input', () => {
                if (liveTailTimer) {
                    refreshDebugLog();
                }
            });
        }

        if (toggleDebugBtn) {
            updateDebugToggleLabel();
            toggleDebugBtn.addEventListener('click', toggleDebugLog);
        }

        if (toggleQueryBtn) {
            updateQueryToggleLabel();
            toggleQueryBtn.addEventListener('click', toggleQueryLogging);
        }

        if (testLogBtn) {
            testLogBtn.addEventListener('click', writeTestLog);
        }

        if (toolsBar && !panel.contains(toolsBar)) {
            toolsBar.style.display = 'flex';
        }
        updateInspectorToolbarVisibility();

        const queryTabs = panel.querySelectorAll('[data-query-tab]');
        const queryPanels = panel.querySelectorAll('.plugency-query-panel');
        const activateQueryTab = (tab) => {
            if (!tab) {
                return;
            }
            queryTabs.forEach((btn) => {
                const isActive = btn.getAttribute('data-query-tab') === tab;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                btn.setAttribute('tabindex', isActive ? '0' : '-1');
            });
            queryPanels.forEach((panelEl) => {
                const isActive = panelEl.getAttribute('data-query-panel') === tab;
                panelEl.classList.toggle('active', isActive);
                panelEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
                panelEl.setAttribute('tabindex', isActive ? '0' : '-1');
                if (isActive) {
                    panelEl.removeAttribute('hidden');
                } else {
                    panelEl.setAttribute('hidden', 'hidden');
                }
            });
        };

        queryTabs.forEach((btn) => {
            btn.addEventListener('click', () => {
                activateQueryTab(btn.getAttribute('data-query-tab'));
            });
        });

        if (queryTabs.length) {
            const defaultTab = panel.querySelector('[data-query-tab].active') || queryTabs[0];
            activateQueryTab(defaultTab.getAttribute('data-query-tab'));
        }

        const queryViewToggle = panel.querySelector('[data-query-view-toggle]');
        const queryViewLabel = panel.querySelector('[data-query-view-label]');
        const setQueryView = (view) => {
            panel.querySelectorAll('.plugency-query-view').forEach((el) => {
                el.style.display = el.getAttribute('data-query-view-target') === view ? '' : 'none';
            });
            if (queryViewLabel) {
                queryViewLabel.textContent = view === 'table' ? 'Table' : 'Array';
            }
        };
        if (queryViewToggle) {
            setQueryView('array');
            queryViewToggle.addEventListener('change', () => {
                const view = queryViewToggle.checked ? 'table' : 'array';
                setQueryView(view);
            });
        }
    });
})();
