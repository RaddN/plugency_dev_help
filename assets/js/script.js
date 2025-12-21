(() => {
    const init = () => {
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
        const optimizerModal = panel ? panel.querySelector('[data-role="image-optimizer-modal"]') : null;
        const optimizerBackdrop = panel ? panel.querySelector('[data-role="image-optimizer-backdrop"]') : null;
        const closeBtn = panel ? panel.querySelector('[data-action="close-panel"]') : null;
        const stateHome = state.homeUrl || '';

        if (!launcher || !panel) {
            return;
        }

        const setStatus = (message, type = 'info') => {
            if (statusBar) {
                statusBar.textContent = message;
                statusBar.className = `plugency-feedback ${type}`;
                return;
            }
            // Fallback if the inline status bar is not found.
            console.log(`[Plugency] ${type.toUpperCase()}: ${message}`);
            try {
                // Alert only for explicit actions when panel status is missing.
                if (type === 'error' || type === 'success') {
                    alert(message);
                }
            } catch (e) {
                /* ignore */
            }
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

        const markCopied = (btn) => {
            if (!btn) {
                return;
            }
            const original = btn.dataset.origText || btn.textContent;
            if (!btn.dataset.origText) {
                btn.dataset.origText = original;
            }
            btn.classList.add('copied');
            btn.textContent = 'Copied';
            setTimeout(() => {
                btn.classList.remove('copied');
                if (!btn.classList.contains('loading')) {
                    btn.textContent = btn.dataset.origText || original;
                }
            }, 1400);
        };

        const copyText = (text, sourceBtn = null, successMessage = 'Copied to clipboard') => navigator.clipboard.writeText(text)
            .then(() => {
                setStatus(successMessage, 'success');
                markCopied(sourceBtn);
            })
            .catch((err) => {
                setStatus('Copy failed.', 'error');
                return Promise.reject(err);
            });

        const copyHtmlSnippet = (snippet, successMessage, logLabel = 'Snippet', sourceBtn = null) => {
            if (!snippet) {
                setStatus('Nothing to copy.', 'error');
                return;
            }
            const copyFallback = () => {
                const textarea = document.createElement('textarea');
                textarea.value = snippet;
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    setStatus(successMessage, 'success');
                    markCopied(sourceBtn);
                } catch (e) {
                    setStatus('Copy failed. Snippet logged in console.', 'error');
                    console.log(`${logLabel}:`, snippet); // safe fallback
                }
                textarea.remove();
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(snippet)
                    .then(() => {
                        setStatus(successMessage, 'success');
                        markCopied(sourceBtn);
                    })
                    .catch(copyFallback);
            } else {
                copyFallback();
            }
        };

        const setLoading = (btn, isLoading, label = 'Working...') => {
            if (!btn) {
                return;
            }
            if (!btn.dataset.origText) {
                btn.dataset.origText = btn.textContent;
            }
            btn.disabled = !!isLoading;
            btn.classList.toggle('loading', !!isLoading);
            if (isLoading) {
                btn.textContent = label;
            } else {
                btn.textContent = btn.dataset.origText || btn.textContent;
            }
        };

        let actionModal = null;
        const getActionModal = () => {
            if (actionModal) {
                return actionModal;
            }
            const backdrop = document.createElement('div');
            backdrop.className = 'plugency-modal-backdrop';
            backdrop.dataset.role = 'action-modal-backdrop';
            const modal = document.createElement('div');
            modal.className = 'plugency-modal';
            modal.dataset.role = 'action-modal';
            const header = document.createElement('div');
            header.className = 'plugency-modal-header';
            const title = document.createElement('h3');
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'plugency-button ghost';
            closeBtn.textContent = 'Close';
            header.appendChild(title);
            header.appendChild(closeBtn);
            const body = document.createElement('div');
            body.className = 'plugency-modal-body';
            const message = document.createElement('p');
            message.className = 'plugency-small';
            const code = document.createElement('pre');
            code.className = 'plugency-pre';
            code.style.maxHeight = '180px';
            code.style.overflow = 'auto';
            code.style.whiteSpace = 'pre-wrap';
            const actions = document.createElement('div');
            actions.className = 'plugency-inline-actions wrap';
            modal.appendChild(header);
            modal.appendChild(body);
            body.appendChild(message);
            body.appendChild(code);
            body.appendChild(actions);
            document.body.appendChild(backdrop);
            document.body.appendChild(modal);
            const close = () => {
                modal.classList.remove('open');
                backdrop.classList.remove('open');
            };
            closeBtn.addEventListener('click', close);
            backdrop.addEventListener('click', close);
            actionModal = { modal, backdrop, title, message, code, actions, close };
            return actionModal;
        };

        const openActionModal = ({ title, message, code = '', copyLabel = 'Copy snippet', hint = '' }) => {
            const modalRef = getActionModal();
            modalRef.title.textContent = title || 'Action required';
            modalRef.message.textContent = message || '';
            modalRef.code.textContent = code || '';
            modalRef.code.style.display = code ? 'block' : 'none';
            modalRef.actions.innerHTML = '';
            if (code) {
                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'plugency-button ghost';
                copyBtn.textContent = copyLabel;
                copyBtn.addEventListener('click', () => copyHtmlSnippet(code, `${copyLabel} copied.`, copyLabel, copyBtn));
                modalRef.actions.appendChild(copyBtn);
            }
            if (hint) {
                const hintNode = document.createElement('span');
                hintNode.className = 'plugency-small';
                hintNode.textContent = hint;
                modalRef.actions.appendChild(hintNode);
            }
            modalRef.modal.classList.add('open');
            modalRef.backdrop.classList.add('open');
        };

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

        const copyBlock = (targetId, sourceBtn = null) => {
            const block = document.getElementById(targetId);
            if (!block) {
                setStatus('Nothing to copy for this block.', 'error');
                return;
            }
            copyText(block.innerText, sourceBtn, 'Block copied.').catch(() => {});
        };

        const copySnapshot = () => {
            if (!snapshotNode) {
                setStatus('Snapshot not found.', 'error');
                return;
            }
            copyText(snapshotNode.textContent.trim(), copySnapshotBtn, 'Snapshot copied.').catch(() => {});
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
                copyText(payload, copyMatchesBtn, 'Matches copied.').catch(() => {});
                return;
            }
            // fetch first if nothing cached
            refreshDebugLog();
            setTimeout(() => {
                if (lastLogData) {
                    const content = params.query ? lastLogData.filtered : lastLogData.content;
                    copyText(content || '', copyMatchesBtn, 'Matches copied.').catch(() => {});
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
            const actionModalNode = document.querySelector('[data-role="action-modal"]');
            const actionBackdrop = document.querySelector('[data-role="action-modal-backdrop"]');
            const inActionModal = (actionModalNode && actionModalNode.contains(event.target)) || (actionBackdrop && actionBackdrop.contains(event.target));
            if (inActionModal) {
                return;
            }
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
            copyText(command, copyCurlBtn, 'cURL command copied.').catch(() => {});
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
            const perfFp = performanceSection.querySelector('[data-role="perf-fp"]');
            const perfFcp = performanceSection.querySelector('[data-role="perf-fcp"]');
            const perfLcp = performanceSection.querySelector('[data-role="perf-lcp"]');
            const perfCls = performanceSection.querySelector('[data-role="perf-cls"]');
            const perfLongTasks = performanceSection.querySelector('[data-role="perf-longtasks"]');
            const perfDomNodes = performanceSection.querySelector('[data-role="perf-dom-nodes"]');
            const perfThird = performanceSection.querySelector('[data-role="perf-third"]');
            const perfLargest = performanceSection.querySelector('[data-role="perf-largest"]');
            const perfSlowList = performanceSection.querySelector('[data-role="perf-slow-resources"]');
            const perfSlowCount = performanceSection.querySelector('[data-role="perf-slow-count"]');
            const perfBlockingList = performanceSection.querySelector('[data-role="perf-blocking-list"]');
            const perfBlockingCount = performanceSection.querySelector('[data-role="perf-blocking-count"]');
            const perfFontsList = performanceSection.querySelector('[data-role="perf-fonts-list"]');
            const perfFontsMeta = performanceSection.querySelector('[data-role="perf-fonts-meta"]');
            const perfCacheList = performanceSection.querySelector('[data-role="perf-cache-list"]');
            const perfCacheMeta = performanceSection.querySelector('[data-role="perf-cache-meta"]');
            const perfThirdList = performanceSection.querySelector('[data-role="perf-third-list"]');
            const perfThirdMeta = performanceSection.querySelector('[data-role="perf-third-meta"]');
            const perfJsList = performanceSection.querySelector('[data-role="perf-js-list"]');
            const perfJsMeta = performanceSection.querySelector('[data-role="perf-js-meta"]');
            const perfCopyBtn = performanceSection.querySelector('[data-action="copy-perf-report"]');
            const perfCacheBtn = performanceSection.querySelector('[data-action="purge-page-cache"]');
            const perfDeferBtn = performanceSection.querySelector('[data-action="toggle-defer-js"]');
            const perfClsList = performanceSection.querySelector('[data-role="perf-cls-list"]');
            const perfClsMeta = performanceSection.querySelector('[data-role="perf-cls-meta"]');
            const perfEmbedList = performanceSection.querySelector('[data-role="perf-embed-list"]');
            const perfEmbedMeta = performanceSection.querySelector('[data-role="perf-embed-meta"]');
            const perfLazyList = performanceSection.querySelector('[data-role="perf-lazy-list"]');
            const perfLazyMeta = performanceSection.querySelector('[data-role="perf-lazy-meta"]');
            const perfConnList = performanceSection.querySelector('[data-role="perf-conn-list"]');
            const perfConnMeta = performanceSection.querySelector('[data-role="perf-conn-meta"]');
            const perfPreloadBtn = performanceSection.querySelector('[data-action="preload-key-assets"]');
            const perfLazyBtn = performanceSection.querySelector('[data-action="lazyload-images"]');
            const perfPreconnectBtn = performanceSection.querySelector('[data-action="preconnect-hosts"]');
            const perfLazyEmbedsBtn = performanceSection.querySelector('[data-action="lazyload-embeds"]');
            const perfHeroPriorityBtn = performanceSection.querySelector('[data-action="boost-hero-image"]');
            const stylesList = performanceSection.querySelector('[data-role="perf-styles-list"]');
            const stylesMeta = performanceSection.querySelector('[data-role="perf-styles-meta"]');
            const scriptsList = performanceSection.querySelector('[data-role="perf-scripts-list"]');
            const scriptsMeta = performanceSection.querySelector('[data-role="perf-scripts-meta"]');
            const imagesList = performanceSection.querySelector('[data-role="perf-images-list"]');
            const imagesMeta = performanceSection.querySelector('[data-role="perf-images-meta"]');
            const metricsList = performanceSection.querySelector('[data-role="perf-metrics-list"]');
            const metricsMeta = performanceSection.querySelector('[data-role="perf-metrics-meta"]');
            const accordionTriggers = performanceSection.querySelectorAll('.plugency-accordion-trigger');
            const optimizeAllBtn = performanceSection.querySelector('[data-action="optimize-all-images"]');
            const optimizerThumb = performanceSection.querySelector('[data-role="optimizer-thumb"]');
            const optimizerMeta = performanceSection.querySelector('[data-role="optimizer-meta"]');
            const optimizerPath = performanceSection.querySelector('[data-role="optimizer-path"]');
            const optimizerEstimate = performanceSection.querySelector('[data-role="optimizer-estimate"]');
            const optimizerSummary = performanceSection.querySelector('[data-role="optimizer-summary"]');
            const optimizerStatus = performanceSection.querySelector('[data-role="optimizer-status"]');
            const optimizerResults = performanceSection.querySelector('[data-role="optimizer-results"]');
            const optimizerDownload = performanceSection.querySelector('[data-role="optimizer-download"]');
            const optimizerProceed = performanceSection.querySelector('[data-action="start-image-optimization"]');
            const optimizerClose = performanceSection.querySelector('[data-action="close-image-optimizer"]');

            let collectedImages = [];
            let selectedImages = [];
            let lcpEntry = null;
            let clsValue = 0;
            let longTaskStats = { count: 0, total: 0 };
            let paintMetrics = { fp: null, fcp: null };
            let latestPerfSummary = {};

            if (window.PerformanceObserver) {
                try {
                    const lcpObserver = new PerformanceObserver((entryList) => {
                        const entries = entryList.getEntries();
                        if (entries && entries.length) {
                            lcpEntry = entries[entries.length - 1];
                        }
                    });
                    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
                } catch (e) {
                    // ignore
                }
                try {
                    const clsObserver = new PerformanceObserver((entryList) => {
                        entryList.getEntries().forEach((entry) => {
                            if (!entry.hadRecentInput) {
                                clsValue += entry.value || 0;
                            }
                        });
                    });
                    clsObserver.observe({ type: 'layout-shift', buffered: true });
                } catch (e) {
                    // ignore
                }
                try {
                    const longObserver = new PerformanceObserver((entryList) => {
                        entryList.getEntries().forEach((entry) => {
                            const dur = entry.duration || 0;
                            if (dur > 0) {
                                longTaskStats.count += 1;
                                longTaskStats.total += dur;
                            }
                        });
                    });
                    longObserver.observe({ entryTypes: ['longtask'] });
                } catch (e) {
                    // ignore
                }
            }

            const estimateSavingsPct = (img) => {
                const naturalArea = (img.naturalWidth || 0) * (img.naturalHeight || 0);
                const renderedArea = (img.renderedWidth || 0) * (img.renderedHeight || 0);
                let savings = 0;
                if (naturalArea > 0 && renderedArea > 0 && renderedArea < naturalArea) {
                    savings = 1 - (renderedArea / naturalArea);
                }
                if (img.transfer && img.transfer > 300000) {
                    savings = Math.max(savings, 0.25);
                }
                return Math.min(0.95, Math.max(0, savings));
            };

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

            const summarizeThirdParty = (entries) => {
                const host = window.location.host;
                let count = 0;
                let transfer = 0;
                const hosts = {};
                entries.forEach((entry) => {
                    if (!entry || !entry.name) {
                        return;
                    }
                    let entryHost = '';
                    try {
                        entryHost = new URL(entry.name).host;
                    } catch (e) {
                        entryHost = '';
                    }
                    if (entryHost && host && entryHost !== host) {
                        count += 1;
                        transfer += entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                        if (!hosts[entryHost]) {
                            hosts[entryHost] = { count: 0, transfer: 0 };
                        }
                        hosts[entryHost].count += 1;
                        hosts[entryHost].transfer += entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    }
                });
                const hostsArr = Object.keys(hosts).map((h) => ({ host: h, count: hosts[h].count, transfer: hosts[h].transfer }));
                hostsArr.sort((a, b) => b.transfer - a.transfer);
                return { count, transfer, hosts: hostsArr.slice(0, 6) };
            };

            const findBlockingAssets = (entries, navMetrics) => {
                const domTime = navMetrics.domContentLoaded || 0;
                const blocking = (entries || []).filter((entry) => {
                    const type = (entry.initiatorType || '').toLowerCase();
                    if (!['link', 'css', 'style', 'script'].includes(type)) {
                        return false;
                    }
                    const size = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    const startedEarly = typeof entry.startTime === 'number' ? entry.startTime <= (domTime || 1500) : true;
                    return startedEarly && ((entry.duration || 0) > 200 || size > 200000);
                });
                blocking.sort((a, b) => (b.duration || 0) - (a.duration || 0));
                return blocking.slice(0, 8);
            };

            const getLargestResource = (entries) => {
                let largest = null;
                entries.forEach((entry) => {
                    const size = entry && (entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0);
                    if (!largest || size > largest.size) {
                        largest = {
                            name: entry.name || '',
                            size,
                            duration: entry.duration || 0,
                        };
                    }
                });
                return largest;
            };

            const findSlowResources = (entries) => {
                const slow = (entries || []).filter((entry) => {
                    const size = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    return (entry.duration && entry.duration > 400) || size > 300000;
                });
                slow.sort((a, b) => {
                    const sizeA = a.transferSize || a.decodedBodySize || a.encodedBodySize || 0;
                    const sizeB = b.transferSize || b.decodedBodySize || b.encodedBodySize || 0;
                    const durA = a.duration || 0;
                    const durB = b.duration || 0;
                    return (sizeB + durB) - (sizeA + durA);
                });
                return slow.slice(0, 8);
            };

            const collectFonts = (entries) => {
                const fonts = (entries || []).filter((entry) => {
                    const name = (entry.name || '').toLowerCase();
                    return /\.woff2?|\.ttf|\.otf/.test(name) || (entry.initiatorType || '').toLowerCase() === 'font';
                }).map((entry) => {
                    const size = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    let host = '';
                    try {
                        host = new URL(entry.name).host;
                    } catch (e) {
                        host = '';
                    }
                    return {
                        name: entry.name || '',
                        size,
                        duration: entry.duration || 0,
                        host,
                    };
                });
                fonts.sort((a, b) => (b.size || 0) - (a.size || 0));
                return fonts.slice(0, 6);
            };

            const findHeavyScripts = (entries) => {
                const heavy = (entries || []).filter((entry) => {
                    const type = (entry.initiatorType || '').toLowerCase();
                    if (type !== 'script') {
                        return false;
                    }
                    const size = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    return size > 200000 || (entry.duration || 0) > 300;
                }).map((entry) => ({
                    name: entry.name || '',
                    size: entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0,
                    duration: entry.duration || 0,
                }));
                heavy.sort((a, b) => (b.size + b.duration) - (a.size + a.duration));
                return heavy.slice(0, 8);
            };

            const findUnSizedMedia = () => {
                const nodes = Array.from(document.querySelectorAll('img, video, iframe')) || [];
                const risky = [];
                nodes.forEach((node) => {
                    const hasDims = node.getAttribute('width') || node.getAttribute('height') || node.style.width || node.style.height;
                    if (node.tagName.toLowerCase() === 'img') {
                        if (!hasDims || node.naturalWidth > 0 && node.naturalHeight > 0 && (!node.width || !node.height)) {
                            risky.push({
                                tag: 'img',
                                src: node.currentSrc || node.src || '',
                                rendered: `${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`,
                                natural: `${node.naturalWidth}x${node.naturalHeight}`,
                            });
                        }
                    } else {
                        if (!hasDims) {
                            risky.push({
                                tag: node.tagName.toLowerCase(),
                                src: node.src || node.currentSrc || node.getAttribute('src') || '',
                                rendered: `${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`,
                                natural: '',
                            });
                        }
                    }
                });
                return risky.slice(0, 12);
            };

            const collectEmbeds = () => {
                const frames = Array.from(document.querySelectorAll('iframe, video')) || [];
                return frames.slice(0, 12).map((node) => ({
                    tag: node.tagName.toLowerCase(),
                    src: node.src || node.currentSrc || node.getAttribute('src') || '',
                    size: `${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`,
                }));
            };

            const findLazyCandidates = () => {
                const images = Array.from(document.querySelectorAll('img')) || [];
                const threshold = window.innerHeight * 1.5;
                const candidates = [];
                images.forEach((img) => {
                    const rect = img.getBoundingClientRect();
                    const belowFold = rect.top > threshold;
                    const loading = (img.getAttribute('loading') || '').toLowerCase();
                    if (belowFold && loading !== 'lazy') {
                        candidates.push({
                            src: img.currentSrc || img.src || '',
                            position: Math.round(rect.top),
                            size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                        });
                    }
                });
                return candidates.slice(0, 12);
            };

            const findConnectionIssues = (entries) => {
                const slow = [];
                (entries || []).forEach((entry) => {
                    const redirect = (entry.redirectEnd || 0) - (entry.redirectStart || 0);
                    const dns = (entry.domainLookupEnd || 0) - (entry.domainLookupStart || 0);
                    const connect = (entry.connectEnd || 0) - (entry.connectStart || 0);
                    if (redirect > 100 || dns > 120 || connect > 120) {
                        slow.push({
                            name: entry.name || '',
                            redirect,
                            dns,
                            connect,
                        });
                    }
                });
                slow.sort((a, b) => ((b.redirect + b.dns + b.connect) - (a.redirect + a.dns + a.connect)));
                return slow.slice(0, 8);
            };

            const collectCacheSignals = (entries) => {
                let uncompressed = 0;
                let sameOrigin = 0;
                (entries || []).forEach((entry) => {
                    if (!entry || !entry.name) {
                        return;
                    }
                    let host = '';
                    try {
                        host = new URL(entry.name).host;
                    } catch (e) {
                        host = '';
                    }
                    if (host && host !== window.location.host) {
                        return;
                    }
                    sameOrigin += 1;
                    const decoded = entry.decodedBodySize || 0;
                    const transfer = entry.transferSize || 0;
                    if (decoded > 1024 && transfer >= decoded * 0.98) {
                        uncompressed += 1;
                    }
                });
                return { sameOrigin, uncompressed };
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
                    const est = Math.round(estimateSavingsPct(img) * 100);
                    const actionBar = document.createElement('div');
                    actionBar.className = 'plugency-inline-actions wrap';
                    const optBtn = document.createElement('button');
                    optBtn.className = 'plugency-button ghost';
                    optBtn.type = 'button';
                    optBtn.textContent = `Optimize (~${est}% possible)`;
                    optBtn.addEventListener('click', () => openOptimizer([img]));
                    actionBar.appendChild(optBtn);
                    row.appendChild(actionBar);
                    container.appendChild(row);
                });
            };

            const populateOptimizer = (images) => {
                selectedImages = images;
                if (optimizerResults) {
                    optimizerResults.style.display = 'none';
                    optimizerResults.textContent = '';
                }
                if (optimizerDownload) {
                    optimizerDownload.style.display = 'none';
                    optimizerDownload.href = '#';
                }
                if (optimizerStatus) {
                    optimizerStatus.textContent = 'Ready to optimise ' + images.length + ' image' + (images.length === 1 ? '' : 's') + '.';
                    optimizerStatus.className = 'plugency-status info';
                }
                const first = images[0] || {};
                if (optimizerThumb) {
                    optimizerThumb.innerHTML = '';
                    if (first.src) {
                        const img = document.createElement('img');
                        img.src = first.src;
                        img.alt = '';
                        img.loading = 'lazy';
                        optimizerThumb.appendChild(img);
                    }
                }
                if (optimizerMeta) {
                    const dims = `${first.renderedWidth || 0}×${first.renderedHeight || 0}px rendered • natural ${first.naturalWidth || 0}×${first.naturalHeight || 0}px`;
                    const sizeText = first.transfer ? ` • transfer ${formatBytes(first.transfer)}` : '';
                    optimizerMeta.textContent = `${dims}${sizeText}`;
                }
                if (optimizerPath) {
                    optimizerPath.textContent = first.src || '';
                }
                if (optimizerEstimate) {
                    const avg = Math.round((images.reduce((sum, img) => sum + estimateSavingsPct(img), 0) / Math.max(1, images.length)) * 100);
                    optimizerEstimate.textContent = `Estimated savings: ~${avg}% (based on current render size and transfer).`;
                }
            };

            const openOptimizer = (images) => {
                if (!optimizerModal || !optimizerBackdrop) {
                    setStatus('Optimizer UI not available.', 'error');
                    return;
                }
                populateOptimizer(images);
                optimizerModal.classList.add('open');
                optimizerBackdrop.classList.add('open');
            };

            const closeOptimizer = () => {
                if (optimizerModal) {
                    optimizerModal.classList.remove('open');
                }
                if (optimizerBackdrop) {
                    optimizerBackdrop.classList.remove('open');
                }
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

            const buildFindings = (styleUsage, scriptUsage, images, summary, signals = {}) => {
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
                if (signals.lcp && signals.lcp > 2500) {
                    findings.push({ text: `Largest Contentful Paint is high (${formatMs(signals.lcp)}). Optimise hero media or reduce render-blocking assets.`, tone: signals.lcp > 4000 ? 'error' : 'warn' });
                }
                if (signals.cls && signals.cls > 0.15) {
                    findings.push({ text: `Layout shift detected (CLS ${signals.cls.toFixed(3)}). Reserve space for images/fonts to avoid movement.`, tone: signals.cls > 0.25 ? 'error' : 'warn' });
                }
                if (signals.longTasks && signals.longTasks.total > 600) {
                    findings.push({ text: `Main thread is busy (${signals.longTasks.count} long tasks totalling ${formatMs(signals.longTasks.total)}). Break up heavy JS or defer non-critical work.`, tone: 'warn' });
                }
                if (signals.thirdParty && signals.thirdParty.count > 10) {
                    findings.push({ text: `Very high third-party usage (${signals.thirdParty.count} requests). Audit tags and SDKs.`, tone: 'warn' });
                }
                if (signals.slowResources && signals.slowResources.length > 0) {
                    findings.push({ text: `${signals.slowResources.length} slow or heavy resources detected. Review caching and compression.`, tone: 'warn' });
                }
                if (signals.lazyCandidates && signals.lazyCandidates.length > 0) {
                    findings.push({ text: `${signals.lazyCandidates.length} images below the fold missing lazyload. Add loading=\"lazy\".`, tone: 'warn' });
                }
                if (signals.connIssues && signals.connIssues.length > 0) {
                    findings.push({ text: `${signals.connIssues.length} requests with slow DNS/connect/redirect. Optimise DNS or reduce redirects.`, tone: 'warn' });
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

            const renderAdvancedSignals = (navMetrics, resourceSummary, thirdParty, largest, slowResources) => {
                if (perfFp || perfFcp) {
                    if (perfFp) {
                        perfFp.textContent = paintMetrics.fp ? formatMs(paintMetrics.fp) : 'n/a';
                    }
                    if (perfFcp) {
                        perfFcp.textContent = paintMetrics.fcp ? formatMs(paintMetrics.fcp) : 'n/a';
                    }
                }
                if (perfLcp) {
                    perfLcp.textContent = lcpEntry ? formatMs(lcpEntry.renderTime || lcpEntry.loadTime || 0) : 'n/a';
                }
                if (perfCls) {
                    perfCls.textContent = clsValue ? clsValue.toFixed(3) : '0.000';
                }
                if (perfLongTasks) {
                    perfLongTasks.textContent = `${longTaskStats.count} (${formatMs(longTaskStats.total)})`;
                }
                if (perfDomNodes) {
                    const domCount = document.getElementsByTagName('*').length;
                    perfDomNodes.textContent = `${domCount.toLocaleString()} nodes`;
                }
                if (perfThird) {
                    perfThird.textContent = `${thirdParty.count} | ${formatBytes(thirdParty.transfer)}`;
                }
                if (perfLargest) {
                    if (largest) {
                        perfLargest.textContent = `${formatBytes(largest.size)} @ ${formatMs(largest.duration)} ${largest.name ? ' | ' + largest.name : ''}`;
                    } else {
                        perfLargest.textContent = 'n/a';
                    }
                }
                if (perfSlowCount) {
                    perfSlowCount.textContent = `${slowResources.length} flagged`;
                }
            };

            const renderSlowResources = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No slow resources detected over 400ms or >300KB.';
                    row.appendChild(text);
                    container.appendChild(row);
                    return;
                }
                items.forEach((entry) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = entry.name || '(unknown)';
                    row.appendChild(title);
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const size = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    const parts = [formatBytes(size), formatMs(entry.duration || 0)];
                    meta.textContent = parts.join(' | ');
                    row.appendChild(meta);
                    container.appendChild(row);
                });
            };

            const renderBlockingAssets = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No obvious render-blocking assets over 200ms or 200KB.';
                    row.appendChild(text);
                    container.appendChild(row);
                    return;
                }
                items.forEach((entry) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = entry.name || '(unknown)';
                    row.appendChild(title);
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const size = entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0;
                    meta.textContent = `${formatMs(entry.duration || 0)} | ${formatBytes(size)}`;
                    row.appendChild(meta);
                    container.appendChild(row);
                });
            };

            const renderFonts = (container, fonts) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!fonts || !fonts.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No web fonts detected in resource timing.';
                    row.appendChild(text);
                    container.appendChild(row);
                    return;
                }
                fonts.forEach((font) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = font.name || '(font)';
                    row.appendChild(title);
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const parts = [formatBytes(font.size), formatMs(font.duration || 0)];
                    if (font.host) {
                        parts.push(font.host);
                    }
                    meta.textContent = parts.join(' | ');
                    row.appendChild(meta);
                    container.appendChild(row);
                });
                if (perfFontsMeta) {
                    perfFontsMeta.textContent = `${fonts.length} font${fonts.length === 1 ? '' : 's'}`;
                }
            };

            const renderThirdPartyHosts = (container, data) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                const hosts = data && data.hosts ? data.hosts : [];
                if (!hosts.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No third-party hosts detected.';
                    row.appendChild(text);
                    container.appendChild(row);
                } else {
                    hosts.forEach((host) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item plugency-perf-row';
                        const title = document.createElement('div');
                        title.className = 'plugency-path';
                        title.textContent = host.host;
                        const meta = document.createElement('div');
                        meta.className = 'plugency-accordion-meta';
                        meta.textContent = `${host.count} requests | ${formatBytes(host.transfer)}`;
                        row.appendChild(title);
                        row.appendChild(meta);
                        container.appendChild(row);
                    });
                }
                if (perfThirdMeta) {
                    perfThirdMeta.textContent = `${(hosts || []).length} host${hosts.length === 1 ? '' : 's'}`;
                }
            };

            const renderHeavyScripts = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No heavy script bundles found (>200KB or >300ms).';
                    row.appendChild(text);
                    container.appendChild(row);
                    if (perfJsMeta) {
                        perfJsMeta.textContent = '0 bundles';
                    }
                    return;
                }
                items.forEach((entry) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = entry.name || '(script)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${formatBytes(entry.size)} | ${formatMs(entry.duration)}`;
                    row.appendChild(title);
                    row.appendChild(meta);
                    container.appendChild(row);
                });
                if (perfJsMeta) {
                    perfJsMeta.textContent = `${items.length} heavy bundle${items.length === 1 ? '' : 's'}`;
                }
            };

            const renderUnSizedMedia = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No obvious un-sized media found.';
                    row.appendChild(text);
                    container.appendChild(row);
                    if (perfClsMeta) {
                        perfClsMeta.textContent = '0 risks';
                    }
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = `${item.tag.toUpperCase()}: ${item.src || '(inline)'}`;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Rendered ${item.rendered}${item.natural ? ` | Natural ${item.natural}` : ''}`;
                    row.appendChild(title);
                    row.appendChild(meta);
                    container.appendChild(row);
                });
                if (perfClsMeta) {
                    perfClsMeta.textContent = `${items.length} risk${items.length === 1 ? '' : 's'}`;
                }
            };

            const renderEmbeds = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No iframes or video embeds detected.';
                    row.appendChild(text);
                    container.appendChild(row);
                    if (perfEmbedMeta) {
                        perfEmbedMeta.textContent = '0 embeds';
                    }
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = `${item.tag.toUpperCase()}: ${item.src || '(inline)'}`;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Size ${item.size}`;
                    row.appendChild(title);
                    row.appendChild(meta);
                    container.appendChild(row);
                });
                if (perfEmbedMeta) {
                    perfEmbedMeta.textContent = `${items.length} embed${items.length === 1 ? '' : 's'}`;
                }
            };

            const renderLazyCandidates = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No obvious below-the-fold images missing loading=\"lazy\".';
                    row.appendChild(text);
                    container.appendChild(row);
                    if (perfLazyMeta) {
                        perfLazyMeta.textContent = '0 candidates';
                    }
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = item.src || '(image)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Pos ${item.position}px | ${item.size}`;
                    row.appendChild(title);
                    row.appendChild(meta);
                    container.appendChild(row);
                });
                if (perfLazyMeta) {
                    perfLazyMeta.textContent = `${items.length} candidate${items.length === 1 ? '' : 's'}`;
                }
            };

            const renderConnectionIssues = (container, items) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No slow redirects/DNS/connects detected.';
                    row.appendChild(text);
                    container.appendChild(row);
                    if (perfConnMeta) {
                        perfConnMeta.textContent = '0 issues';
                    }
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = item.name || '(request)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Redirect ${formatMs(item.redirect)} | DNS ${formatMs(item.dns)} | Connect ${formatMs(item.connect)}`;
                    row.appendChild(title);
                    row.appendChild(meta);
                    container.appendChild(row);
                });
                if (perfConnMeta) {
                    perfConnMeta.textContent = `${items.length} issue${items.length === 1 ? '' : 's'}`;
                }
            };

            const renderCacheSignals = (container, signals) => {
                if (!container) {
                    return;
                }
                container.innerHTML = '';
                const { sameOrigin = 0, uncompressed = 0 } = signals || {};
                const rows = [
                    { label: 'Same-origin requests inspected', value: sameOrigin },
                    { label: 'Likely uncompressed', value: uncompressed },
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
                if (perfCacheMeta) {
                    perfCacheMeta.textContent = `${uncompressed} uncompressed`;
                }
            };

            const readOptimizerOptions = () => {
                const opts = {
                    resize_to_rendered: true,
                    convert_webp: true,
                    update_db: false,
                    remove_original: false,
                    lossless: false,
                };
                optimizerModal?.querySelectorAll('input[data-option]').forEach((input) => {
                    opts[input.getAttribute('data-option')] = input.checked;
                });
                if (opts.remove_original && !opts.update_db) {
                    opts.remove_original = false;
                    if (optimizerStatus) {
                        optimizerStatus.textContent = 'Remove original is disabled unless database update is enabled.';
                        optimizerStatus.className = 'plugency-status warn';
                    }
                }
                return opts;
            };

            const normalizeImagePayload = (images) => {
                return (Array.isArray(images) ? images : []).map((img) => ({
                    src: img.src || '',
                    rendered_width: img.renderedWidth || 0,
                    rendered_height: img.renderedHeight || 0,
                    natural_width: img.naturalWidth || 0,
                    natural_height: img.naturalHeight || 0,
                    transfer: img.transfer || 0,
                }));
            };

            const runOptimization = () => {
                if (!selectedImages.length) {
                    if (optimizerStatus) {
                        optimizerStatus.textContent = 'Select at least one image to optimize.';
                        optimizerStatus.className = 'plugency-status error';
                    }
                    return;
                }
                const options = readOptimizerOptions();
                const payload = {
                    images: JSON.stringify(normalizeImagePayload(selectedImages)),
                    options: JSON.stringify(options),
                    page_id: state.pageId || 0,
                };
                if (optimizerStatus) {
                    optimizerStatus.textContent = 'Optimizing images...';
                    optimizerStatus.className = 'plugency-status info';
                }
                post('plugency_optimize_images', payload)
                    .then((data) => {
                        if (optimizerStatus) {
                            optimizerStatus.textContent = 'Optimization finished.';
                            optimizerStatus.className = 'plugency-status success';
                        }
                        if (optimizerResults) {
                            optimizerResults.style.display = 'block';
                            optimizerResults.textContent = JSON.stringify(data.results || [], null, 2);
                        }
                        if (optimizerDownload && data.download_url) {
                            optimizerDownload.href = data.download_url;
                            optimizerDownload.style.display = 'inline-flex';
                            optimizerDownload.textContent = data.download_size ? `Download bundle (${formatBytes(data.download_size)})` : 'Download bundle';
                        }
                        setStatus('Optimized images ready to download.', 'success');
                    })
                    .catch((error) => {
                        if (optimizerStatus) {
                            optimizerStatus.textContent = error.message;
                            optimizerStatus.className = 'plugency-status error';
                        }
                        setStatus(error.message, 'error');
                    });
            };

            const populate = () => {
                const entries = getResourceEntries();
                const resourceIndex = buildResourceIndex(entries);
                const navMetrics = collectNavigationMetrics();
                const summary = summarizeResources(entries);
                const blockingAssets = findBlockingAssets(entries, navMetrics);
                const styleUsage = mapAssetsToUsage(snapshotData.styles || [], resourceIndex);
                const scriptUsage = mapAssetsToUsage(snapshotData.scripts || [], resourceIndex);
                const imageData = collectImages(resourceIndex);
                const thirdParty = summarizeThirdParty(entries);
                const largest = getLargestResource(entries);
                const slowResources = findSlowResources(entries);
                const fonts = collectFonts(entries);
                const cacheSignals = collectCacheSignals(entries);
                const paints = performance.getEntriesByType && performance.getEntriesByType('paint') || [];
                paints.forEach((entry) => {
                    if (entry.name === 'first-paint') {
                        paintMetrics.fp = entry.startTime || entry.duration || null;
                    } else if (entry.name === 'first-contentful-paint') {
                        paintMetrics.fcp = entry.startTime || entry.duration || null;
                    }
                });
                const heavyScripts = findHeavyScripts(entries);
                const unsizedMedia = findUnSizedMedia();
                const embeds = collectEmbeds();
                const lazyCandidates = findLazyCandidates();
                const connIssues = findConnectionIssues(entries);
                collectedImages = imageData;
                renderSummary(navMetrics, summary);
                renderAdvancedSignals(navMetrics, summary, thirdParty, largest, slowResources);
                renderList(stylesList, styleUsage, 'No styles enqueued on this view.');
                renderList(scriptsList, scriptUsage, 'No scripts enqueued on this view.');
                renderImages(imagesList, imageData);
                renderMetrics(metricsList, summary);
                renderSlowResources(perfSlowList, slowResources);
                renderBlockingAssets(perfBlockingList, blockingAssets);
                renderFonts(perfFontsList, fonts);
                renderCacheSignals(perfCacheList, cacheSignals);
                renderThirdPartyHosts(perfThirdList, thirdParty);
                renderHeavyScripts(perfJsList, heavyScripts);
                renderUnSizedMedia(perfClsList, unsizedMedia);
                renderEmbeds(perfEmbedList, embeds);
                renderLazyCandidates(perfLazyList, lazyCandidates);
                renderConnectionIssues(perfConnList, connIssues);
                if (perfBlockingCount) {
                    perfBlockingCount.textContent = `${blockingAssets.length} blocking`;
                }
                if (perfSlowCount) {
                    perfSlowCount.textContent = `${slowResources.length} flagged`;
                }
                if (perfCacheMeta) {
                    perfCacheMeta.textContent = `${cacheSignals.uncompressed || 0} uncompressed`;
                }
                if (perfThirdMeta) {
                    perfThirdMeta.textContent = `${thirdParty.hosts ? thirdParty.hosts.length : 0} host${thirdParty.hosts && thirdParty.hosts.length === 1 ? '' : 's'}`;
                }
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
                const findings = buildFindings(styleUsage, scriptUsage, imageData, summary, {
                    lcp: lcpEntry ? (lcpEntry.renderTime || lcpEntry.loadTime || 0) : null,
                    cls: clsValue,
                    longTasks: longTaskStats,
                    thirdParty,
                    slowResources,
                    blockingAssets,
                    uncompressed: cacheSignals.uncompressed,
                    unsizedMedia,
                    heavyScripts,
                    embeds,
                    lazyCandidates,
                    connIssues,
                });
                renderFindings(findings);
                latestPerfSummary = {
                    navMetrics,
                    summary,
                    thirdParty,
                    slowResources,
                    blockingAssets,
                    cacheSignals,
                    fonts,
                    heavyScripts,
                    unsizedMedia,
                    embeds,
                    lazyCandidates,
                    connIssues,
                    paints: paintMetrics,
                    lcp: lcpEntry ? (lcpEntry.renderTime || lcpEntry.loadTime || 0) : null,
                    cls: clsValue,
                    longTasks: longTaskStats,
                };
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

            if (optimizeAllBtn) {
                optimizeAllBtn.addEventListener('click', () => {
                    if (!collectedImages.length) {
                        setStatus('No images detected to optimize.', 'error');
                        return;
                    }
                    openOptimizer(collectedImages);
                });
            }

            if (perfCopyBtn) {
                perfCopyBtn.addEventListener('click', () => {
                    setLoading(perfCopyBtn, true, 'Copying...');
                    const report = {
                        ...latestPerfSummary,
                        timestamp: new Date().toISOString(),
                        url: window.location.href,
                    };
                    const pretty = JSON.stringify(report, null, 2);
                    copyText(pretty, perfCopyBtn, 'Performance report copied.')
                        .then(() => {
                            openActionModal({
                                title: 'Performance report copied',
                                message: 'Paste this JSON into your bug report or performance ticket.',
                                code: pretty,
                                copyLabel: 'Copy report again',
                                hint: report.url || '',
                            });
                        })
                        .catch(() => {
                            /* handled in copyText */
                        })
                        .finally(() => setLoading(perfCopyBtn, false));
                });
            }

            if (perfCacheBtn) {
                perfCacheBtn.addEventListener('click', () => {
                    setLoading(perfCacheBtn, true, 'Sending...');
                    setStatus('Sending cache purge request...', 'info');
                    post('plugency_purge_cache', {})
                        .then((data) => {
                            const msg = data && data.message ? data.message : 'Cache purge signal sent.';
                            openActionModal({
                                title: 'Cache purge sent',
                                message: msg,
                                code: '',
                                hint: 'If your cache plugin needs extra setup, hook into plugency_dev_help_purge_cache.',
                            });
                            setStatus(msg, 'success');
                        })
                        .catch((error) => setStatus(error.message, 'error'))
                        .finally(() => setLoading(perfCacheBtn, false));
                });
            }

            if (perfDeferBtn) {
                perfDeferBtn.addEventListener('click', () => {
                    setLoading(perfDeferBtn, true, 'Scanning...');
                    const scripts = Array.from(document.querySelectorAll('script[src]')) || [];
                    const sameHost = scripts.filter((s) => {
                        try {
                            return new URL(s.src, window.location.href).host === window.location.host;
                        } catch (e) {
                            return false;
                        }
                    }).map((s) => s.src);
                    const sample = sameHost.slice(0, 10);
                    const note = sample.length ? `Example candidates to defer: ${sample.join(', ')}` : 'No same-origin scripts found.';
                    const snippet = sample.map((src) => `<script src=\"${src}\" defer></script>`).join('\n');
                    openActionModal({
                        title: 'Defer JS suggestion',
                        message: 'Add defer to non-critical scripts to improve render. Apply to these candidates:',
                        code: snippet || '<script src="app.js" defer></script>',
                        copyLabel: 'Copy defer examples',
                        hint: note,
                    });
                    setStatus(`Defer suggestion: mark non-critical scripts with defer. ${note}`, 'info');
                    setLoading(perfDeferBtn, false);
                });
            }

            if (perfPreloadBtn) {
                perfPreloadBtn.addEventListener('click', () => {
                    setLoading(perfPreloadBtn, true, 'Building...');
                    setStatus('Building preload snippet...', 'info');
                    const links = [];
                    const heroImg = collectedImages && collectedImages[0] ? collectedImages[0].src : '';
                    if (heroImg) {
                        links.push(`<link rel=\"preload\" as=\"image\" href=\"${heroImg}\">`);
                    }
                    const css = (snapshotData.styles || []).slice(0, 3).map((s) => s.src).filter(Boolean);
                    css.forEach((href) => links.push(`<link rel=\"preload\" as=\"style\" href=\"${href}\">`));
                    if (links.length === 0) {
                        setStatus('No preload candidates detected.', 'error');
                        return;
                    }
                    const snippet = links.join('\n');
                    openActionModal({
                        title: 'Preload key assets',
                        message: 'Add this snippet to your <head> to preload the hero image and top CSS. Copy and paste into your theme or head injection tool.',
                        code: snippet,
                        copyLabel: 'Copy preload snippet',
                        hint: 'Place before render-blocking assets for best impact.',
                    });
                    setStatus('Preload snippet ready.', 'success');
                    setLoading(perfPreloadBtn, false);
                });
            }

            if (perfPreconnectBtn) {
                perfPreconnectBtn.addEventListener('click', () => {
                    setLoading(perfPreconnectBtn, true, 'Building...');
                    setStatus('Building preconnect snippet...', 'info');
                    const hosts = latestPerfSummary && latestPerfSummary.thirdParty && Array.isArray(latestPerfSummary.thirdParty.hosts)
                        ? latestPerfSummary.thirdParty.hosts
                        : [];
                    if (!hosts.length) {
                        setStatus('No third-party hosts detected to preconnect.', 'error');
                        setLoading(perfPreconnectBtn, false);
                        return;
                    }
                    const snippet = hosts.slice(0, 6).map((item) => {
                        const host = item.host || item;
                        return `<link rel=\"preconnect\" href=\"https://${host}\" crossorigin>\n<link rel=\"dns-prefetch\" href=\"//${host}\">`;
                    }).join('\n');
                    openActionModal({
                        title: 'Preconnect third-parties',
                        message: 'Add this snippet to your <head> so DNS/TLS handshakes start earlier for heavy third-party hosts.',
                        code: snippet,
                        copyLabel: 'Copy preconnect snippet',
                        hint: 'Place before external scripts such as analytics/ads.',
                    });
                    setStatus('Preconnect snippet ready.', 'success');
                    setLoading(perfPreconnectBtn, false);
                });
            }

            if (perfLazyBtn) {
                perfLazyBtn.addEventListener('click', () => {
                    setLoading(perfLazyBtn, true, 'Applying...');
                    setStatus('Applying loading=\"lazy\" to below-the-fold images...', 'info');
                    const imgs = Array.from(document.querySelectorAll('img')) || [];
                    let updated = 0;
                    imgs.forEach((img) => {
                        const rect = img.getBoundingClientRect();
                        if (rect.top > window.innerHeight * 1.2 && !img.getAttribute('loading')) {
                            img.setAttribute('loading', 'lazy');
                            updated += 1;
                        }
                    });
                    const msg = updated ? `Applied loading=\"lazy\" to ${updated} images (preview only).` : 'No new lazyload targets found.';
                    setStatus(msg, updated ? 'success' : 'info');
                    openActionModal({
                        title: 'Lazyload images',
                        message: updated ? `${updated} image${updated === 1 ? '' : 's'} marked with loading="lazy" in this view. Save these changes in your templates/theme for production.` : 'No new below-the-fold images were found without lazyload.',
                        code: updated ? '<img loading="lazy" ...>' : '',
                        copyLabel: 'Copy lazy attribute sample',
                        hint: updated ? 'Replicate loading="lazy" on below-the-fold images server-side.' : '',
                    });
                    setLoading(perfLazyBtn, false);
                });
            }

            if (perfLazyEmbedsBtn) {
                perfLazyEmbedsBtn.addEventListener('click', () => {
                    setLoading(perfLazyEmbedsBtn, true, 'Applying...');
                    setStatus('Applying lazyload to embeds...', 'info');
                    const threshold = window.innerHeight * 1.2;
                    let updated = 0;
                    const frames = Array.from(document.querySelectorAll('iframe')) || [];
                    frames.forEach((frame) => {
                        const rect = frame.getBoundingClientRect();
                        if (rect.top > threshold && !frame.getAttribute('loading')) {
                            frame.setAttribute('loading', 'lazy');
                            updated += 1;
                        }
                    });
                    const msg = updated ? `Applied lazyload to ${updated} embed${updated === 1 ? '' : 's'} (preview only).` : 'No embed targets found.';
                    setStatus(msg, updated ? 'success' : 'info');
                    openActionModal({
                        title: 'Lazyload embeds',
                        message: msg + ' Add loading="lazy" to iframes/videos below the fold in your templates.',
                        code: updated ? '<iframe loading="lazy" ...></iframe>' : '',
                        copyLabel: 'Copy iframe lazy example',
                        hint: 'Add server-side to persist.',
                    });
                    setLoading(perfLazyEmbedsBtn, false);
                });
            }

            if (perfHeroPriorityBtn) {
                perfHeroPriorityBtn.addEventListener('click', () => {
                    setLoading(perfHeroPriorityBtn, true, 'Marking...');
                    const hero = (() => {
                        if (lcpEntry && lcpEntry.element && lcpEntry.element.tagName && lcpEntry.element.tagName.toLowerCase() === 'img') {
                            return lcpEntry.element;
                        }
                        const images = Array.from(document.querySelectorAll('img')) || [];
                        const threshold = window.innerHeight * 1.2;
                        return images.find((img) => {
                            const rect = img.getBoundingClientRect();
                            return rect.top >= 0 && rect.top < threshold;
                        });
                    })();
                    if (!hero) {
                        setStatus('No hero image found to prioritize.', 'error');
                        setLoading(perfHeroPriorityBtn, false);
                        return;
                    }
                    hero.setAttribute('fetchpriority', 'high');
                    hero.setAttribute('decoding', 'async');
                    const src = hero.currentSrc || hero.src || '(image)';
                    setStatus(`Marked hero image as high priority (${src}).`, 'success');
                    openActionModal({
                        title: 'Hero image prioritised',
                        message: 'The hero image was marked with fetchpriority="high" and decoding="async" in this preview. Apply this to your template for permanent effect.',
                        code: '<img fetchpriority="high" decoding="async" ...>',
                        copyLabel: 'Copy hero attributes',
                        hint: src,
                    });
                    setLoading(perfHeroPriorityBtn, false);
                });
            }

            if (optimizerClose) {
                optimizerClose.addEventListener('click', closeOptimizer);
            }
            if (optimizerBackdrop) {
                optimizerBackdrop.addEventListener('click', closeOptimizer);
            }
            if (optimizerProceed) {
                optimizerProceed.addEventListener('click', runOptimization);
            }
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
                    copyText(info.selector, copyBtn, 'Selector copied.').catch(() => {});
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
                    copyBlock(target, button);
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
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
