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
        const requestsSection = panel ? panel.querySelector('[data-section="requests"]') : null;
        const assetsSection = panel ? panel.querySelector('[data-section="assets"]') : null;
        const performanceSection = panel ? panel.querySelector('[data-section="performance"]') : null;
        const optimizerModal = panel ? panel.querySelector('[data-role="image-optimizer-modal"]') : null;
        const optimizerBackdrop = panel ? panel.querySelector('[data-role="image-optimizer-backdrop"]') : null;
        const closeBtn = panel ? panel.querySelector('[data-action="close-panel"]') : null;
        const stateHome = state.homeUrl || '';
        let bundleCard;
        let bundleExportBtn;
        let thirdGovCard;
        let thirdGovExport;
        let thirdGovFacade;
        let a11yCard;
        let a11yRunBtn;
        let a11yFixBtn;
        let a11yExportBtn;
        let runA11yAudit;
        let fixCommonA11y;
        let exportA11yReport;
        let getResourceEntries;
        let summarizeThirdParty;
        let analyzeBundles;
        let exportBundleReport;
        let lcpEntry = null;

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

        const initHeartbeatMonitor = () => {
            if (!requestsSection) return;
            const card = requestsSection.querySelector('[data-role="heartbeat-card"]');
            if (!card) return;
            const timelineList = card.querySelector('[data-role="heartbeat-timeline"]');
            const usageList = card.querySelector('[data-role="heartbeat-usage"]');
            const impactPre = card.querySelector('[data-role="heartbeat-impact"] pre') || card.querySelector('[data-role="heartbeat-impact"]');
            const metaBadge = card.querySelector('[data-role="heartbeat-meta"]');
            const saveBtn = card.querySelector('[data-action="save-heartbeat-settings"]');
            const applyBtn = card.querySelector('[data-action="apply-heartbeat-recommended"]');
            const startTestBtn = card.querySelector('[data-action="start-heartbeat-test"]');
            const stopTestBtn = card.querySelector('[data-action="stop-heartbeat-test"]');
            const intervalInputs = card.querySelectorAll('[data-heartbeat-key]');
            const toggleInputs = card.querySelectorAll('[data-heartbeat-toggle]');
            const abInputs = card.querySelectorAll('[data-heartbeat-ab]');

            const heartbeatData = snapshotData.heartbeat || {};
            let heartbeatLog = Array.isArray(heartbeatData.log) ? heartbeatData.log.slice(0, 30) : [];
            let liveLog = [];
            let settings = heartbeatData.settings || {};
            let recommended = heartbeatData.recommended || {};
            let usage = heartbeatData.usage || {};
            let abActive = false;
            let abToggle = false;

            const formatBytes = (bytes) => {
                const num = Number(bytes) || 0;
                if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
                if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
                return `${num} B`;
            };

            const formatMs = (val) => `${Math.round(Number(val) || 0)} ms`;

            const renderUsage = () => {
                if (!usageList) return;
                usageList.innerHTML = '';
                const items = Object.entries(usage || {}).slice(0, 8);
                if (!items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No plugin signals yet.';
                    row.appendChild(text);
                    usageList.appendChild(row);
                    return;
                }
                items.forEach(([key, count]) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = key || '(unknown key)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${count} events`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    usageList.appendChild(row);
                });
            };

            const renderImpact = () => {
                if (!impactPre) return;
                const savings = heartbeatData.savings || {};
                const lines = [];
                lines.push(`Events recorded: ${savings.events || heartbeatLog.length}`);
                lines.push(`Runtime spent: ${savings.runtime_ms ? `${savings.runtime_ms} ms` : 'n/a'}`);
                lines.push(`Potential savings: ${savings.savings_ms || 0} ms (${savings.savings_pct || 0}%) if recommended intervals are applied.`);
                impactPre.textContent = lines.join('\n');
            };

            const renderMeta = () => {
                if (!metaBadge) return;
                const count = heartbeatLog.length + liveLog.length;
                const savings = heartbeatData.savings || {};
                const tone = count > 15 ? 'warn' : 'success';
                metaBadge.classList.remove('neutral', 'warn', 'success');
                metaBadge.classList.add(tone);
                metaBadge.textContent = `Events ${count} | Est. savings ${savings.savings_pct || 0}%`;
            };

            const renderTimeline = () => {
                if (!timelineList) return;
                timelineList.innerHTML = '';
                const combined = [...liveLog, ...heartbeatLog].slice(0, 25);
                if (!combined.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'Waiting for heartbeat traffic...';
                    row.appendChild(text);
                    timelineList.appendChild(row);
                    return;
                }
                combined.forEach((entry) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    const time = entry.time ? new Date(entry.time).toLocaleTimeString() : 'now';
                    label.textContent = `${time} | ${entry.page_type || entry.source || 'heartbeat'}`;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const interval = entry.interval ? `${entry.interval}s` : '';
                    meta.textContent = `${formatBytes(entry.payload_bytes || 0)} | ${formatMs(entry.duration_ms || 0)} ${interval ? `| ${interval}` : ''}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.title = (entry.keys || entry.data_keys || []).join(', ') || 'No payload keys';
                    timelineList.appendChild(row);
                });
            };

            const syncInputs = () => {
                intervalInputs.forEach((input) => {
                    const key = input.getAttribute('data-heartbeat-key');
                    if (key && settings.intervals && settings.intervals[key] !== undefined) {
                        input.value = settings.intervals[key];
                    }
                });
                toggleInputs.forEach((input) => {
                    const key = input.getAttribute('data-heartbeat-toggle');
                    if (key && settings[key] !== undefined) {
                        input.value = settings[key] ? '1' : '0';
                    }
                });
                abInputs.forEach((input) => {
                    const key = input.getAttribute('data-heartbeat-ab');
                    if (key && settings.ab_test && settings.ab_test[key] !== undefined) {
                        input.value = settings.ab_test[key];
                    }
                });
            };

            const collectSettings = () => {
                const next = { intervals: {}, ab_test: {} };
                intervalInputs.forEach((input) => {
                    const key = input.getAttribute('data-heartbeat-key');
                    if (key) {
                        next.intervals[key] = parseInt(input.value || '0', 10) || 1;
                    }
                });
                toggleInputs.forEach((input) => {
                    const key = input.getAttribute('data-heartbeat-toggle');
                    if (key) {
                        next[key] = input.value === '1';
                    }
                });
                abInputs.forEach((input) => {
                    const key = input.getAttribute('data-heartbeat-ab');
                    if (key) {
                        next.ab_test[key] = parseInt(input.value || '0', 10) || 1;
                    }
                });
                return next;
            };

            const saveSettings = () => {
                const payload = collectSettings();
                setLoading(saveBtn, true, 'Saving...');
                post('plugency_save_heartbeat_settings', { settings: JSON.stringify(payload) })
                    .then((data) => {
                        settings = data.settings || settings;
                        heartbeatData.settings = settings;
                        setStatus('Heartbeat settings saved.', 'success');
                        syncInputs();
                    })
                    .catch((err) => setStatus(err.message, 'error'))
                    .finally(() => setLoading(saveBtn, false));
            };

            const applyRecommended = () => {
                setLoading(applyBtn, true, 'Applying...');
                post('plugency_apply_heartbeat_recommendations', {})
                    .then((data) => {
                        settings = data.settings || settings;
                        heartbeatData.settings = settings;
                        setStatus('Recommended intervals applied.', 'success');
                        syncInputs();
                    })
                    .catch((err) => setStatus(err.message, 'error'))
                    .finally(() => setLoading(applyBtn, false));
            };

            const recordLiveEvent = (payload = {}, duration = 0) => {
                const entry = {
                    time: new Date().toISOString(),
                    page_type: document.body.className.includes('wp-admin') ? 'admin' : 'frontend',
                    payload_bytes: JSON.stringify(payload).length,
                    duration_ms: duration || 0,
                    interval: (window.wp && wp.heartbeat && typeof wp.heartbeat.interval === 'function') ? wp.heartbeat.interval() : null,
                    keys: Object.keys(payload || {}),
                    source: 'client',
                };
                liveLog.unshift(entry);
                if (liveLog.length > 20) {
                    liveLog = liveLog.slice(0, 20);
                }
                entry.keys.forEach((k) => {
                    usage[k] = (usage[k] || 0) + 1;
                });
                renderTimeline();
                renderUsage();
                renderMeta();
            };

            const startAbTest = () => {
                if (!window.wp || !wp.heartbeat || typeof wp.heartbeat.interval !== 'function') {
                    setStatus('Heartbeat library unavailable for A/B test.', 'error');
                    return;
                }
                abActive = true;
                abToggle = false;
                const a = Number(settings?.ab_test?.variant_a || 30);
                wp.heartbeat.interval(a);
                setStatus('Heartbeat A/B test started (toggling A/B each beat).', 'success');
            };

            const stopAbTest = () => {
                if (abActive && window.wp && wp.heartbeat && typeof wp.heartbeat.interval === 'function') {
                    const fallback = Number(settings?.intervals?.admin || 30);
                    wp.heartbeat.interval(fallback);
                }
                abActive = false;
                setStatus('Heartbeat A/B test stopped.', 'neutral');
            };

            const bindHeartbeatEvents = () => {
                if (!window.jQuery || !window.wp || !wp.heartbeat) {
                    return;
                }
                const $ = window.jQuery;
                $(document).on('heartbeat-send.plugency', (event, data) => {
                    if (abActive && wp.heartbeat && typeof wp.heartbeat.interval === 'function') {
                        const a = Number(settings?.ab_test?.variant_a || 30);
                        const b = Number(settings?.ab_test?.variant_b || 60);
                        wp.heartbeat.interval(abToggle ? b : a);
                        abToggle = !abToggle;
                    }
                    recordLiveEvent(data || {}, 0);
                });
                $(document).on('heartbeat-tick.plugency', (event, data) => {
                    recordLiveEvent(data || {}, 0);
                });
            };

            if (saveBtn) saveBtn.addEventListener('click', saveSettings);
            if (applyBtn) applyBtn.addEventListener('click', applyRecommended);
            if (startTestBtn) startTestBtn.addEventListener('click', startAbTest);
            if (stopTestBtn) stopTestBtn.addEventListener('click', stopAbTest);

            syncInputs();
            renderTimeline();
            renderUsage();
            renderImpact();
            renderMeta();
            bindHeartbeatEvents();
        };

        const initOpcache = () => {
            if (!assetsSection) {
                return;
            }
            const card = assetsSection.querySelector('[data-role="opcache-card"]');
            if (!card) {
                return;
            }
            const metaBadge = card.querySelector('[data-role="opcache-meta"]');
            const enabledLabel = card.querySelector('[data-role="opcache-enabled"]');
            const hitRateLabel = card.querySelector('[data-role="opcache-hit-rate"]');
            const memUsedLabel = card.querySelector('[data-role="opcache-mem-used"]');
            const fragLabel = card.querySelector('[data-role="opcache-frag"]');
            const trendCanvas = card.querySelector('[data-role="opcache-trend"]');
            const configPre = card.querySelector('[data-role="opcache-config"] pre') || card.querySelector('[data-role="opcache-config"]');
            const scriptsList = card.querySelector('[data-role="opcache-scripts"]');
            const missedList = card.querySelector('[data-role="opcache-missed"]');
            const suggestionsList = card.querySelector('[data-role="opcache-suggestions"]');
            const clearBtn = card.querySelector('[data-action="clear-opcache"]');

            const opcache = snapshotData.opcache || {};
            const status = opcache.status || {};
            const config = opcache.config || {};
            const memory = status.memory_usage || {};
            const stats = status.opcache_statistics || {};
            const history = Array.isArray(opcache.history) ? opcache.history : [];
            const scripts = Array.isArray(opcache.scripts) ? opcache.scripts : [];
            const missed = Array.isArray(opcache.missed) ? opcache.missed : [];
            const recommended = opcache.recommended || {};

            const formatBytes = (bytes) => {
                const num = Number(bytes) || 0;
                if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
                if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
                return `${num} B`;
            };

            const renderStats = () => {
                const enabled = !!opcache.enabled;
                const available = !!opcache.available;
                const hits = Number(stats.hits || 0);
                const misses = Number(stats.misses || 0);
                const hitRate = (hits + misses) > 0 ? (hits / (hits + misses)) * 100 : 0;
                const used = Number(memory.used_memory || 0);
                const free = Number(memory.free_memory || 0);
                const wasted = Number(memory.wasted_memory || 0);
                const total = used + free + wasted || 1;
                const frag = (wasted / total) * 100;
                if (enabledLabel) {
                    enabledLabel.textContent = enabled ? 'On' : (available ? 'Off' : 'Unavailable');
                }
                if (hitRateLabel) hitRateLabel.textContent = `${hitRate.toFixed(2)}%`;
                if (memUsedLabel) memUsedLabel.textContent = `${formatBytes(used)} / ${formatBytes(total)}`;
                if (fragLabel) fragLabel.textContent = `${frag.toFixed(2)}%`;
                if (metaBadge) {
                    metaBadge.classList.remove('neutral', 'warn', 'success', 'error');
                    if (!available) {
                        metaBadge.classList.add('error');
                        metaBadge.textContent = 'Unavailable';
                    } else if (!enabled) {
                        metaBadge.classList.add('warn');
                        metaBadge.textContent = 'Disabled';
                    } else {
                        metaBadge.classList.add(hitRate > 90 ? 'success' : 'warn');
                        metaBadge.textContent = `Hit ${hitRate.toFixed(1)}%`;
                    }
                }
            };

            const renderTrend = () => {
                if (!trendCanvas || !trendCanvas.getContext) return;
                const ctx = trendCanvas.getContext('2d');
                const width = trendCanvas.width;
                const height = trendCanvas.height;
                ctx.clearRect(0, 0, width, height);
                if (!history.length) {
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText('No history yet.', 8, 16);
                    return;
                }
                const values = history.map((h) => Number(h.hit_rate || 0)).slice(0, 30).reverse();
                const max = 100;
                ctx.strokeStyle = '#22c55e';
                ctx.beginPath();
                values.forEach((val, idx) => {
                    const x = (width / Math.max(values.length - 1, 1)) * idx;
                    const y = height - ((val / max) * (height - 10)) - 5;
                    if (idx === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
            };

            const renderConfig = () => {
                if (!configPre) return;
                const directives = (config.directives || {});
                const lines = Object.keys(directives).length
                    ? Object.entries(directives).map(([k, v]) => `${k} = ${v}`)
                    : ['OPcache config not available.'];
                configPre.textContent = lines.join('\n');
            };

            const renderScripts = () => {
                if (!scriptsList) return;
                scriptsList.innerHTML = '';
                const sorted = scripts.slice().sort((a, b) => (b.hits || 0) - (a.hits || 0)).slice(0, 25);
                if (!sorted.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No cached scripts found.';
                    row.appendChild(text);
                    scriptsList.appendChild(row);
                    return;
                }
                sorted.forEach((script) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = script.full_path || script.file || '(unknown)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const ts = script.timestamp ? new Date(script.timestamp * 1000).toLocaleTimeString() : '';
                    meta.textContent = `${script.hits || 0} hits${ts ? ` | ${ts}` : ''}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    scriptsList.appendChild(row);
                });
            };

            const renderMissed = () => {
                if (!missedList) return;
                missedList.innerHTML = '';
                const list = missed.slice(0, 12);
                if (!list.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No uncached included scripts detected.';
                    row.appendChild(text);
                    missedList.appendChild(row);
                    return;
                }
                list.forEach((file) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = file;
                    row.appendChild(text);
                    missedList.appendChild(row);
                });
            };

            const renderSuggestions = () => {
                if (!suggestionsList) return;
                suggestionsList.innerHTML = '';
                const directives = config.directives || {};
                const items = [];
                Object.entries(recommended || {}).forEach(([key, rec]) => {
                    const current = directives[key];
                    if (current === undefined) {
                        items.push({ text: `${key} missing (recommend ${rec})`, tone: 'warn' });
                    } else if (String(current) !== String(rec) && key !== 'opcache.validate_timestamps') {
                        items.push({ text: `${key}=${current} (recommend ${rec})`, tone: 'info' });
                    }
                });
                if ((status.restarts || 0) > 0) {
                    items.push({ text: `Frequent restarts observed (${status.restarts})`, tone: 'warn' });
                }
                if ((status.num_cached_scripts || 0) < 10) {
                    items.push({ text: 'Few scripts cached; verify OPcache is enabled for PHP-FPM/Apache.', tone: 'warn' });
                }
                if (!items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'OPcache configuration looks good.';
                    row.appendChild(text);
                    suggestionsList.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.text;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    pill.textContent = item.tone === 'warn' ? 'Action' : 'Info';
                    if (item.tone === 'warn') pill.classList.add('warn'); else pill.classList.add('neutral');
                    row.appendChild(label);
                    row.appendChild(pill);
                    suggestionsList.appendChild(row);
                });
            };

            const clearOpcache = () => {
                if (!clearBtn) return;
                setLoading(clearBtn, true, 'Clearing...');
                post('plugency_clear_opcache', {})
                    .then(() => setStatus('OPcache cleared.', 'success'))
                    .catch((err) => setStatus(err.message, 'error'))
                    .finally(() => setLoading(clearBtn, false));
            };

            renderStats();
            renderTrend();
            renderConfig();
            renderScripts();
            renderMissed();
            renderSuggestions();

            if (clearBtn) {
                clearBtn.addEventListener('click', clearOpcache);
            }
        };

        const initContentModels = () => {
            const card = panel ? panel.querySelector('[data-role="content-model-card"]') : null;
            if (!card) return;
            const cptList = card.querySelector('[data-role="content-model-cpts"]');
            const taxList = card.querySelector('[data-role="content-model-taxes"]');
            const conflictsPre = card.querySelector('[data-role="content-model-conflicts"] pre') || card.querySelector('[data-role="content-model-conflicts"]');
            const recosList = card.querySelector('[data-role="content-model-recos"]');
            const metaBadge = card.querySelector('[data-role="content-model-meta"]');
            const cleanupBtn = card.querySelector('[data-action="cleanup-unused-cpts"]');
            const exportBtn = card.querySelector('[data-action="export-content-models"]');

            const data = snapshotData.content_models || {};
            const cpts = Array.isArray(data.post_types) ? data.post_types : [];
            const taxes = Array.isArray(data.taxonomies) ? data.taxonomies : [];
            const conflicts = Array.isArray(data.rewrite_conflicts) ? data.rewrite_conflicts : [];

            const setMeta = (unusedCount) => {
                if (!metaBadge) return;
                const total = cpts.length + taxes.length;
                metaBadge.textContent = `${total} models | ${unusedCount} unused`;
                metaBadge.classList.remove('neutral', 'warn', 'success');
                metaBadge.classList.add(unusedCount > 0 ? 'warn' : 'success');
            };

            const renderList = (list, items, emptyText, formatter) => {
                if (!list) return;
                list.innerHTML = '';
                if (!items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = emptyText;
                    row.appendChild(text);
                    list.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = formatter(item).label;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = formatter(item).meta;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    const tone = formatter(item).tone || 'neutral';
                    pill.textContent = formatter(item).pill || '';
                    pill.classList.add(tone === 'warn' ? 'warn' : tone === 'success' ? 'success' : 'neutral');
                    row.appendChild(label);
                    row.appendChild(meta);
                    if (formatter(item).pill) row.appendChild(pill);
                    list.appendChild(row);
                });
            };

            const unused = cpts.filter((c) => (c.total || 0) === 0 && c.name !== 'post' && c.name !== 'page');
            const formatCpt = (cpt) => {
                const pill = cpt.total === 0 ? 'Unused' : (cpt.show_in_rest ? 'REST' : '');
                const tone = cpt.total === 0 ? 'warn' : 'neutral';
                const registrar = cpt.registrar ? cpt.registrar.split('/').pop() : '(unknown)';
                return {
                    label: `${cpt.label || cpt.name} (${cpt.name})`,
                    meta: `${cpt.total} posts | ${cpt.public ? 'public' : 'private'} | by ${registrar}`,
                    pill,
                    tone,
                };
            };

            const formatTax = (tax) => {
                const pill = tax.count === 0 ? 'Empty' : (tax.show_in_rest ? 'REST' : '');
                const tone = tax.count === 0 ? 'warn' : 'neutral';
                const registrar = tax.registrar ? tax.registrar.split('/').pop() : '(unknown)';
                return {
                    label: `${tax.label || tax.name} (${tax.name})`,
                    meta: `${tax.count} terms | ${tax.public ? 'public' : 'private'} | by ${registrar}`,
                    pill,
                    tone,
                };
            };

            const renderConflicts = () => {
                if (!conflictsPre) return;
                if (!conflicts.length) {
                    conflictsPre.textContent = 'No rewrite conflicts detected.';
                    return;
                }
                const lines = conflicts.slice(0, 10).map((c) => `Regex: ${c.regex} -> ${c.targets ? c.targets.join(' , ') : ''}`);
                conflictsPre.textContent = lines.join('\n');
            };

            const renderRecos = () => {
                if (!recosList) return;
                recosList.innerHTML = '';
                const recs = [];
                unused.forEach((c) => recs.push(`"${c.name}" is unused. Consider removing registration or delete posts.`));
                cpts.forEach((c) => {
                    if (c.public && !c.has_archive) {
                        recs.push(`${c.name}: Enable archives or add archive template for better discovery.`);
                    }
                    if (c.show_in_rest && !c.rest_base) {
                        recs.push(`${c.name}: Set rest_base for stable REST URLs.`);
                    }
                    if (!c.rewrite || c.rewrite === false) {
                        recs.push(`${c.name}: No rewrite rules; confirm slugs are accessible.`);
                    }
                });
                taxes.forEach((t) => {
                    if (t.public && (!t.object_type || !t.object_type.length)) {
                        recs.push(`${t.name}: Taxonomy not attached to post types.`);
                    }
                });
                if (!recs.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No issues detected.';
                    row.appendChild(text);
                    recosList.appendChild(row);
                    return;
                }
                recs.slice(0, 8).forEach((rec) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = rec;
                    row.appendChild(text);
                    recosList.appendChild(row);
                });
            };

            const cleanupUnused = () => {
                if (!unused.length || !cleanupBtn) {
                    setStatus('No unused CPTs detected for cleanup.', 'warn');
                    return;
                }
                const names = unused.map((c) => c.name);
                setLoading(cleanupBtn, true, 'Cleaning...');
                post('plugency_cleanup_unused_cpts', { names: names.join(',') })
                    .then((data) => {
                        setStatus(`Requested cleanup for: ${names.join(', ')}. Deleted posts: ${JSON.stringify(data.cleanup || [])}`, 'success');
                    })
                    .catch((err) => setStatus(err.message, 'error'))
                    .finally(() => setLoading(cleanupBtn, false));
            };

            const exportData = () => {
                const payload = {
                    post_types: cpts,
                    taxonomies: taxes,
                    conflicts,
                    unused: unused.map((u) => u.name),
                    generated_at: new Date().toISOString(),
                };
                openActionModal({
                    title: 'Content models export',
                    message: 'Copy inventory JSON for further analysis.',
                    code: JSON.stringify(payload, null, 2),
                    copyLabel: 'Copy models JSON',
                });
            };

            renderList(cptList, cpts, 'No post types found.', formatCpt);
            renderList(taxList, taxes, 'No taxonomies found.', formatTax);
            renderConflicts();
            renderRecos();
            setMeta(unused.length);
            if (cleanupBtn) cleanupBtn.addEventListener('click', cleanupUnused);
            if (exportBtn) exportBtn.addEventListener('click', exportData);
        };

        const initRenderBlocking = () => {
            if (!assetsSection) return;
            const card = assetsSection.querySelector('[data-role="render-blocking-card"]');
            if (!card) return;
            const list = card.querySelector('[data-role="render-blocking-list"]');
            const simPre = card.querySelector('[data-role="render-blocking-sim"] pre') || card.querySelector('[data-role="render-blocking-sim"]');
            const codePre = card.querySelector('[data-role="render-blocking-code"] pre') || card.querySelector('[data-role="render-blocking-code"]');
            const recos = card.querySelector('[data-role="render-blocking-recos"]');
            const metaBadge = card.querySelector('[data-role="render-blocking-meta"]');
            const simBtn = card.querySelector('[data-action="render-blocking-simulate"]');
            const applyBtn = card.querySelector('[data-action="render-blocking-apply"]');
            const exportBtn = card.querySelector('[data-action="render-blocking-export"]');

            const formatBytes = (bytes) => {
                const num = Number(bytes) || 0;
                if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
                if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
                return `${num} B`;
            };

            const perfEntries = performance && performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
            const resMap = {};
            perfEntries.forEach((entry) => {
                if (!entry.name) return;
                const key = entry.name.split('#')[0].split('?')[0];
                resMap[key] = entry;
            });

            const collectBlocking = () => {
                const blockingCss = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                    .filter((l) => !l.media || l.media === 'all' || l.media === 'screen');
                const blockingJs = Array.from(document.querySelectorAll('script[src]'))
                    .filter((s) => !s.async && !s.defer && s.type !== 'module');
                const data = [];
                blockingCss.forEach((node) => {
                    const href = node.href || '';
                    const entry = resMap[href.split('#')[0].split('?')[0]] || {};
                    const matched = (snapshotData.styles || []).find((s) => (s.src || '') === href);
                    data.push({
                        type: 'css',
                        url: href,
                        bytes: matched ? matched.bytes : entry.transferSize || entry.decodedBodySize || 0,
                        fetch_ms: matched ? matched.fetch_ms || 0 : entry.duration || 0,
                    });
                });
                blockingJs.forEach((node) => {
                    const src = node.src || '';
                    const entry = resMap[src.split('#')[0].split('?')[0]] || {};
                    const matched = (snapshotData.scripts || []).find((s) => (s.src || '') === src);
                    data.push({
                        type: 'js',
                        url: src,
                        bytes: matched ? matched.bytes : entry.transferSize || entry.decodedBodySize || 0,
                        fetch_ms: matched ? matched.fetch_ms || 0 : entry.duration || 0,
                    });
                });
                return data;
            };

            const renderList = () => {
                if (!list) return;
                list.innerHTML = '';
                const items = collectBlocking();
                if (!items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No render-blocking assets detected.';
                    row.appendChild(text);
                    list.appendChild(row);
                    if (metaBadge) {
                        metaBadge.textContent = 'Clean';
                        metaBadge.classList.remove('neutral', 'warn', 'success');
                        metaBadge.classList.add('success');
                    }
                    return items;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.url || '(inline)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${item.type.toUpperCase()} | ${formatBytes(item.bytes)} | ${Math.round(item.fetch_ms || 0)} ms`;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    pill.textContent = item.type === 'css' ? 'CSS' : 'JS';
                    pill.classList.add('warn');
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.appendChild(pill);
                    list.appendChild(row);
                });
                if (metaBadge) {
                    metaBadge.textContent = `${items.length} blocking`;
                    metaBadge.classList.remove('neutral', 'warn', 'success');
                    metaBadge.classList.add('warn');
                }
                return items;
            };

            const buildSnippet = () => {
                const items = collectBlocking();
                const css = items.filter((i) => i.type === 'css');
                const js = items.filter((i) => i.type === 'js');
                const lines = [];
                css.forEach((item, idx) => {
                    if (!item.url) return;
                    const fallback = `<noscript><link rel="stylesheet" href="${item.url}"></noscript>`;
                    lines.push(`<link rel="preload" as="style" href="${item.url}" onload="this.rel='stylesheet'">`);
                    if (idx === 0) {
                        lines.push(fallback);
                    }
                });
                js.forEach((item) => {
                    if (!item.url) return;
                    lines.push(`<script src="${item.url}" defer></script>`);
                });
                lines.push('<noscript>Styles load normally when JavaScript is disabled.</noscript>');
                return lines.join('\n');
            };

            const renderRecosList = () => {
                if (!recos) return;
                recos.innerHTML = '';
                const entries = [
                    'Inline critical CSS (or preload with onload swap); keep size small to avoid blocking.',
                    'Defer/async non-critical scripts; consider splitting hydration bundles.',
                    'Add noscript fallbacks for preloaded CSS and key scripts.',
                    'Monitor CLS after changing load order; keep font/image dimensions explicit.',
                ];
                entries.forEach((txt) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const span = document.createElement('span');
                    span.className = 'plugency-source';
                    span.textContent = txt;
                    row.appendChild(span);
                    recos.appendChild(row);
                });
            };

            const simulate = () => {
                if (!simPre) return;
                const items = collectBlocking();
                const totalMs = items.reduce((sum, i) => sum + (i.fetch_ms || 0), 0);
                const totalBytes = items.reduce((sum, i) => sum + (i.bytes || 0), 0);
                const predicted = Math.round(totalMs * 0.6);
                const message = [
                    `Blocking assets: ${items.length}`,
                    `Total size: ${formatBytes(totalBytes)}`,
                    `Total load time (observed): ~${Math.round(totalMs)} ms`,
                    `Predicted render savings with defer/preload: ~${predicted} ms`,
                    'CLS note: ensure font/image dimensions to prevent layout shifts.',
                ].join('\n');
                simPre.textContent = message;
                return { predicted, items };
            };

            const applyStrategy = () => {
                const cssNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
                cssNodes.forEach((node) => {
                    if (node.dataset.plugencyOptimized === '1') return;
                    const href = node.href;
                    node.rel = 'preload';
                    node.as = 'style';
                    node.onload = function onload() {
                        this.rel = 'stylesheet';
                    };
                    node.dataset.plugencyOptimized = '1';
                    const ns = document.createElement('noscript');
                    ns.innerHTML = `<link rel="stylesheet" href="${href}">`;
                    node.parentNode && node.parentNode.insertBefore(ns, node.nextSibling);
                });
                const scripts = Array.from(document.querySelectorAll('script[src]')).filter((s) => !s.async && !s.defer && s.type !== 'module');
                scripts.forEach((s) => {
                    s.defer = true;
                });
                setStatus('Applied preload/defer strategy for this page (non-persistent).', 'success');
                simulate();
                if (codePre) {
                    codePre.textContent = buildSnippet();
                }
            };

            const exportCode = () => {
                const snippet = buildSnippet();
                openActionModal({
                    title: 'Optimized loading code',
                    message: 'Place this in your theme head/footer to reduce render-blocking resources.',
                    code: snippet,
                    copyLabel: 'Copy snippet',
                });
            };

            renderList();
            renderRecosList();
            simulate();
            if (simBtn) simBtn.addEventListener('click', simulate);
            if (applyBtn) applyBtn.addEventListener('click', applyStrategy);
            if (exportBtn) exportBtn.addEventListener('click', exportCode);
            if (codePre) {
                codePre.textContent = buildSnippet();
            }
        };

        const schemaTemplates = {
            Article: {
                '@context': 'https://schema.org',
                '@type': 'Article',
                headline: document.title || 'Example headline',
                datePublished: new Date().toISOString(),
                author: { '@type': 'Person', name: 'Author Name' },
            },
            Product: {
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: document.title || 'Product Name',
                image: [],
                description: '',
                offers: {
                    '@type': 'Offer',
                    priceCurrency: 'USD',
                    price: '0.00',
                    availability: 'https://schema.org/InStock',
                },
            },
            Organization: {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: document.title || 'Organization',
                url: window.location.href,
                logo: '',
                sameAs: [],
            },
            Person: {
                '@context': 'https://schema.org',
                '@type': 'Person',
                name: document.title || 'Person Name',
                url: window.location.href,
            },
            Event: {
                '@context': 'https://schema.org',
                '@type': 'Event',
                name: document.title || 'Event Title',
                startDate: new Date().toISOString(),
                eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
                location: {
                    '@type': 'VirtualLocation',
                    url: window.location.href,
                },
            },
        };

        const initSchemaTool = () => {
            if (!performanceSection) return;
            const schemaCard = performanceSection.querySelector('[data-role="schema-card"]');
            if (!schemaCard) return;
            const schemaList = schemaCard.querySelector('[data-role="schema-list"]');
            const schemaErrors = schemaCard.querySelector('[data-role="schema-errors"]');
            const schemaEditor = schemaCard.querySelector('[data-role="schema-editor"]');
            const schemaTemplateSelect = schemaCard.querySelector('[data-role="schema-template"]');
            const schemaPreview = schemaCard.querySelector('[data-role="schema-preview"] pre') || schemaCard.querySelector('[data-role="schema-preview"]');
            const schemaTemplatesPre = schemaCard.querySelector('[data-role="schema-templates"] pre') || schemaCard.querySelector('[data-role="schema-templates"]');
            const schemaMeta = schemaCard.querySelector('[data-role="schema-meta"]');
            const schemaValidateBtn = schemaCard.querySelector('[data-action="schema-validate"]');
            const schemaExportBtn = schemaCard.querySelector('[data-action="schema-export"]');
            const schemaApplyBtn = schemaCard.querySelector('[data-action="schema-apply-template"]');
            const schemaPreviewBtn = schemaCard.querySelector('[data-action="schema-preview"]');
            const detectSchema = () => {
                const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')) || [];
                const found = [];
                scripts.forEach((node, idx) => {
                    const raw = node.textContent || '';
                    try {
                        const parsed = JSON.parse(raw);
                        const type = Array.isArray(parsed['@type']) ? parsed['@type'].join(',') : parsed['@type'] || 'Unknown';
                        found.push({ type, raw, idx });
                    } catch (e) {
                        found.push({ type: 'Invalid JSON', raw: raw.slice(0, 200), idx, error: e.message });
                    }
                });
                return found;
            };

            const renderList = () => {
                if (!schemaList) return;
                schemaList.innerHTML = '';
                const found = detectSchema();
                if (!found.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No JSON-LD markup detected on this page.';
                    row.appendChild(text);
                    schemaList.appendChild(row);
                    return;
                }
                found.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.type;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Script #${item.idx + 1}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.addEventListener('click', () => {
                        if (schemaEditor) {
                            schemaEditor.value = item.raw;
                        }
                    });
                    schemaList.appendChild(row);
                });
                if (schemaMeta) {
                    schemaMeta.textContent = `${found.length} block${found.length === 1 ? '' : 's'} found`;
                    schemaMeta.classList.remove('neutral', 'warn', 'success');
                    schemaMeta.classList.add(found.length ? 'success' : 'neutral');
                }
            };

            const validateSchema = (input) => {
                const errors = [];
                let parsed = null;
                try {
                    parsed = JSON.parse(input);
                } catch (e) {
                    errors.push({ text: `Invalid JSON: ${e.message}`, severity: 'error' });
                    return { errors, warnings: [], parsed: null };
                }
                if (!parsed['@context']) {
                    errors.push({ text: 'Missing @context (should be https://schema.org).', severity: 'error' });
                }
                if (!parsed['@type']) {
                    errors.push({ text: 'Missing @type.', severity: 'error' });
                }
                if (parsed['@context'] && parsed['@context'] !== 'https://schema.org') {
                    errors.push({ text: `@context is ${parsed['@context']} (expected https://schema.org).`, severity: 'warn' });
                }
                const warnings = [];
                if (parsed['@type'] === 'Article' && !parsed.headline) {
                    warnings.push({ text: 'Article missing headline.', severity: 'warn' });
                }
                if (parsed['@type'] === 'Product' && !(parsed.offers && parsed.offers.price)) {
                    warnings.push({ text: 'Product missing offers.price.', severity: 'warn' });
                }
                return { errors, warnings, parsed };
            };

            const renderErrors = (results) => {
                if (!schemaErrors) return;
                schemaErrors.innerHTML = '';
                const list = [...(results.errors || []), ...(results.warnings || [])];
                if (!list.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No errors detected.';
                    row.appendChild(text);
                    schemaErrors.appendChild(row);
                    return;
                }
                list.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.text;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    pill.textContent = item.severity === 'error' ? 'Error' : 'Warn';
                    pill.classList.add(item.severity === 'error' ? 'error' : 'warn');
                    row.appendChild(label);
                    row.appendChild(pill);
                    schemaErrors.appendChild(row);
                });
                if (schemaMeta) {
                    const errors = results.errors.length;
                    const warns = results.warnings.length;
                    schemaMeta.textContent = `${errors} errors, ${warns} warnings`;
                    schemaMeta.classList.remove('neutral', 'warn', 'success');
                    schemaMeta.classList.add(errors ? 'warn' : 'success');
                }
            };

            const renderPreview = (parsed) => {
                if (!schemaPreview) return;
                if (!parsed) {
                    schemaPreview.textContent = 'No valid schema to preview.';
                    return;
                }
                const title = parsed.headline || parsed.name || document.title || 'Example title';
                const desc = parsed.description || (document.querySelector('meta[name="description"]') ? document.querySelector('meta[name="description"]').content : '') || 'Description';
                const url = parsed.url || window.location.href;
                const snippet = `${title}\n${url}\n${desc}`;
                schemaPreview.textContent = snippet;
            };

            const applyTemplate = () => {
                if (!schemaTemplateSelect || !schemaEditor) return;
                const val = schemaTemplateSelect.value;
                if (!val || !schemaTemplates[val]) return;
                schemaEditor.value = JSON.stringify(schemaTemplates[val], null, 2);
                if (schemaTemplatesPre) {
                    schemaTemplatesPre.textContent = `Inserted ${val} template. Edit then validate.`;
                }
            };

            const runValidation = () => {
                if (!schemaEditor) return;
                const results = validateSchema(schemaEditor.value);
                renderErrors(results);
                renderPreview(results.parsed);
                return results;
            };

            renderList();
            if (schemaValidateBtn) schemaValidateBtn.addEventListener('click', runValidation);
            if (schemaApplyBtn) schemaApplyBtn.addEventListener('click', applyTemplate);
            if (schemaPreviewBtn) schemaPreviewBtn.addEventListener('click', runValidation);
            if (schemaExportBtn) {
                schemaExportBtn.addEventListener('click', () => {
                    const results = runValidation();
                    openActionModal({
                        title: 'Schema export',
                        message: 'Copy JSON-LD for implementation.',
                        code: schemaEditor ? schemaEditor.value : '',
                        copyLabel: 'Copy JSON-LD',
                        hint: results && results.errors && results.errors.length ? 'Contains validation errors/warnings.' : '',
                    });
                });
            }
            if (schemaEditor) {
                const found = detectSchema();
                if (found[0]) {
                    schemaEditor.value = found[0].raw;
                }
            }
        };

        const initPwaTool = () => {
            if (!performanceSection) return;
            const pwaCard = performanceSection.querySelector('[data-role="pwa-card"]');
            if (!pwaCard) return;
            const pwaMeta = pwaCard.querySelector('[data-role="pwa-meta"]');
            const pwaSwStatus = pwaCard.querySelector('[data-role="pwa-sw-status"]');
            const pwaCacheList = pwaCard.querySelector('[data-role="pwa-cache-list"]');
            const pwaChecklist = pwaCard.querySelector('[data-role="pwa-checklist"]');
            const pwaPush = pwaCard.querySelector('[data-role="pwa-push"] pre') || pwaCard.querySelector('[data-role="pwa-push"]');
            const pwaInstall = pwaCard.querySelector('[data-role="pwa-install"] pre') || pwaCard.querySelector('[data-role="pwa-install"]');
            const pwaRefreshBtn = pwaCard.querySelector('[data-action="pwa-refresh"]');
            const pwaOfflineBtn = pwaCard.querySelector('[data-action="pwa-offline-toggle"]');
            const pwaClearCacheBtn = pwaCard.querySelector('[data-action="pwa-clear-cache"]');
            const pwaCheckUpdateBtn = pwaCard.querySelector('[data-action="pwa-check-updates"]');
            let offlineSimulated = false;

            const setMeta = (text, tone = 'neutral') => {
                if (!pwaMeta) return;
                pwaMeta.textContent = text;
                pwaMeta.classList.remove('neutral', 'warn', 'success', 'error');
                pwaMeta.classList.add(tone);
            };

            const renderList = (node, items, empty) => {
                if (!node) return;
                node.innerHTML = '';
                if (!items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = empty;
                    row.appendChild(text);
                    node.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.label;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = item.meta || '';
                    row.appendChild(label);
                    row.appendChild(meta);
                    node.appendChild(row);
                });
            };

            const checkServiceWorker = async () => {
                if (!pwaSwStatus) return;
                const rows = [];
                if (!('serviceWorker' in navigator)) {
                    rows.push({ label: 'Service worker not supported in this browser.', meta: '' });
                    setMeta('No SW support', 'error');
                    renderList(pwaSwStatus, rows, 'Not supported');
                    return;
                }
                const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
                if (!registration) {
                    rows.push({ label: 'No service worker registered.', meta: 'Register one to enable PWA.' });
                    setMeta('No service worker', 'warn');
                    renderList(pwaSwStatus, rows, 'No SW');
                    return;
                }
                const sw = registration.active || registration.waiting || registration.installing;
                rows.push({ label: `Scope: ${registration.scope}`, meta: sw && sw.state ? sw.state : '' });
                if (registration.waiting) {
                    rows.push({ label: 'Waiting worker ready to activate', meta: 'Call skipWaiting() to update.' });
                }
                setMeta(sw && sw.state === 'activated' ? 'SW active' : 'SW registered', 'success');
                renderList(pwaSwStatus, rows, 'No SW details');
            };

            const inspectCaches = async () => {
                if (!pwaCacheList || !('caches' in window)) return;
                try {
                    const keys = await caches.keys();
                    if (!keys.length) {
                        renderList(pwaCacheList, [], 'No caches found.');
                        return;
                    }
                    const rows = [];
                    for (const key of keys) {
                        const cache = await caches.open(key);
                        const requests = await cache.keys();
                        rows.push({ label: key, meta: `${requests.length} entries` });
                    }
                    renderList(pwaCacheList, rows, 'No caches found.');
                } catch (e) {
                    renderList(pwaCacheList, [{ label: 'Cache inspection failed', meta: e.message }], 'No caches found.');
                }
            };

            const validateManifest = async () => {
                const checklist = [];
                const isHttps = window.location.protocol === 'https:';
                checklist.push({ label: 'Served over HTTPS', meta: isHttps ? 'OK' : 'Required', tone: isHttps ? 'success' : 'warn' });
                const manifestLink = document.querySelector('link[rel="manifest"]');
                if (manifestLink && manifestLink.href) {
                    try {
                        const res = await fetch(manifestLink.href);
                        if (!res.ok) throw new Error(`${res.status}`);
                        const json = await res.json();
                        checklist.push({ label: 'Manifest fetched', meta: manifestLink.href, tone: 'success' });
                        if (!json.start_url) checklist.push({ label: 'Manifest missing start_url', meta: '', tone: 'warn' });
                        if (!json.icons || !json.icons.length) checklist.push({ label: 'Manifest missing icons', meta: '', tone: 'warn' });
                        if (!json.name && !json.short_name) checklist.push({ label: 'Manifest missing name/short_name', meta: '', tone: 'warn' });
                    } catch (e) {
                        checklist.push({ label: 'Manifest fetch failed', meta: e.message, tone: 'warn' });
                    }
                } else {
                    checklist.push({ label: 'Manifest link missing', meta: 'Add <link rel="manifest">', tone: 'warn' });
                }
                if (!('serviceWorker' in navigator)) {
                    checklist.push({ label: 'Service worker unsupported', meta: '', tone: 'error' });
                }
                renderChecklist(checklist);
            };

            const renderChecklist = (items) => {
                if (!pwaChecklist) return;
                pwaChecklist.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No checklist items.';
                    row.appendChild(text);
                    pwaChecklist.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.label;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = item.meta || '';
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    pill.textContent = item.tone === 'success' ? 'OK' : 'Check';
                    pill.classList.add(item.tone === 'success' ? 'success' : 'warn');
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.appendChild(pill);
                    pwaChecklist.appendChild(row);
                });
            };

            const checkPush = async () => {
                if (!pwaPush) return;
                if (!('Notification' in window)) {
                    pwaPush.textContent = 'Notifications not supported.';
                    return;
                }
                const perm = Notification.permission;
                let reg = null;
                if ('serviceWorker' in navigator) {
                    reg = await navigator.serviceWorker.getRegistration().catch(() => null);
                }
                pwaPush.textContent = `Permission: ${perm}. SW: ${reg ? 'registered' : 'missing'}. Use your push service to send test messages.`;
            };

            const checkInstall = () => {
                if (!pwaInstall) return;
                const mode = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
                pwaInstall.textContent = `Display mode: ${mode}. Add to home screen prompt is browser-controlled.`;
            };

            const toggleOffline = () => {
                offlineSimulated = !offlineSimulated;
                if (offlineSimulated) {
                    window.addEventListener('beforeunload', () => {});
                    setStatus('Offline simulation enabled (requests will still go out unless blocked by service worker).', 'warn');
                    pwaOfflineBtn && (pwaOfflineBtn.textContent = 'Disable offline');
                } else {
                    setStatus('Offline simulation disabled.', 'neutral');
                    pwaOfflineBtn && (pwaOfflineBtn.textContent = 'Simulate offline');
                }
            };

            const clearCaches = async () => {
                if (!('caches' in window)) {
                    setStatus('Cache API not supported.', 'error');
                    return;
                }
                if (pwaClearCacheBtn) setLoading(pwaClearCacheBtn, true, 'Clearing...');
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
                setStatus('All caches cleared (client-side).', 'success');
                inspectCaches();
                if (pwaClearCacheBtn) setLoading(pwaClearCacheBtn, false);
            };

            const checkUpdate = async () => {
                if (!('serviceWorker' in navigator)) return;
                if (pwaCheckUpdateBtn) setLoading(pwaCheckUpdateBtn, true, 'Checking...');
                const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
                if (reg && reg.update) {
                    await reg.update();
                    setStatus('Service worker update check triggered.', 'success');
                } else {
                    setStatus('No service worker registration found.', 'warn');
                }
                if (pwaCheckUpdateBtn) setLoading(pwaCheckUpdateBtn, false);
            };

            const refreshAll = () => {
                checkServiceWorker();
                inspectCaches();
                validateManifest();
                checkPush();
                checkInstall();
            };

            refreshAll();
            if (pwaRefreshBtn) pwaRefreshBtn.addEventListener('click', refreshAll);
            if (pwaOfflineBtn) pwaOfflineBtn.addEventListener('click', toggleOffline);
            if (pwaClearCacheBtn) pwaClearCacheBtn.addEventListener('click', clearCaches);
            if (pwaCheckUpdateBtn) pwaCheckUpdateBtn.addEventListener('click', checkUpdate);
        };

        const initFontOptimizer = () => {
            if (!performanceSection) return;
            const fontOptCard = performanceSection.querySelector('[data-role="font-optimizer-card"]');
            if (!fontOptCard) return;
            const fontOptList = fontOptCard.querySelector('[data-role="font-opt-list"]');
            const fontOptStrategy = fontOptCard.querySelector('[data-role="font-opt-strategy"] pre') || fontOptCard.querySelector('[data-role="font-opt-strategy"]');
            const fontOptRecos = fontOptCard.querySelector('[data-role="font-opt-recos"]');
            const fontOptCode = fontOptCard.querySelector('[data-role="font-opt-code"] pre') || fontOptCard.querySelector('[data-role="font-opt-code"]');
            const fontOptMeta = fontOptCard.querySelector('[data-role="font-opt-meta"]');
            const fontOptSimBtn = fontOptCard.querySelector('[data-action="font-opt-simulate"]');
            const fontOptApplyBtn = fontOptCard.querySelector('[data-action="font-opt-apply"]');
            const fontOptExportBtn = fontOptCard.querySelector('[data-action="font-opt-export"]');

            const formatBytes = (bytes) => {
                const num = Number(bytes) || 0;
                if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
                if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
                return `${num} B`;
            };

            const paintEntries = performance.getEntriesByType && performance.getEntriesByType('paint') ? performance.getEntriesByType('paint') : [];
            const fpEntry = paintEntries.find((p) => p.name === 'first-paint');
            const fcpEntry = paintEntries.find((p) => p.name === 'first-contentful-paint');
            const fp = fpEntry ? fpEntry.startTime : 0;
            const fcp = fcpEntry ? fcpEntry.startTime : 0;

            const resourceEntries = performance.getEntriesByType && performance.getEntriesByType('resource') ? performance.getEntriesByType('resource') : [];
            const fontResources = resourceEntries.filter((r) => /\.(woff2?|ttf|otf)$/i.test(r.name || ''));

            const collectFonts = () => {
                const fonts = [];
                if (document.fonts && document.fonts.forEach) {
                    document.fonts.forEach((fontFace) => {
                        const entry = fontResources.find((r) => (r.name || '').indexOf(fontFace.family.replace(/['"]/g, '')) !== -1);
                        fonts.push({
                            family: fontFace.family,
                            weight: fontFace.weight || '400',
                            style: fontFace.style || 'normal',
                            status: fontFace.status || 'unknown',
                            duration: entry ? entry.duration : 0,
                            transfer: entry ? (entry.transferSize || entry.decodedBodySize || entry.encodedBodySize || 0) : 0,
                        });
                    });
                }
                if (!fonts.length && fontResources.length) {
                    fontResources.forEach((r) => {
                        fonts.push({
                            family: r.name.split('/').pop(),
                            weight: 'unknown',
                            style: 'normal',
                            status: 'unknown',
                            duration: r.duration,
                            transfer: r.transferSize || r.decodedBodySize || r.encodedBodySize || 0,
                        });
                    });
                }
                return fonts;
            };

            const renderFonts = () => {
                if (!fontOptList) return;
                fontOptList.innerHTML = '';
                const fonts = collectFonts();
                if (!fonts.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No web fonts detected.';
                    row.appendChild(text);
                    fontOptList.appendChild(row);
                    return { fonts, totalBytes: 0, totalDuration: 0 };
                }
                let totalBytes = 0;
                let totalDuration = 0;
                const seen = new Set();
                fonts.forEach((font) => {
                    totalBytes += font.transfer || 0;
                    totalDuration += font.duration || 0;
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = `${font.family} (${font.weight}, ${font.style})`;
                    label.style.fontFamily = font.family;
                    label.style.fontWeight = font.weight;
                    label.style.fontStyle = font.style;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${font.status || 'unknown'} | ${formatBytes(font.transfer)} | ${Math.round(font.duration || 0)} ms`;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    pill.textContent = 'Sample';
                    pill.classList.add('neutral');
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.appendChild(pill);
                    fontOptList.appendChild(row);
                    seen.add(font.family);
                });
                if (fontOptMeta) {
                    fontOptMeta.textContent = `${fonts.length} fonts | ${formatBytes(totalBytes)}`;
                    fontOptMeta.classList.remove('neutral', 'warn', 'success');
                    fontOptMeta.classList.add(fonts.length > 4 ? 'warn' : 'success');
                }
                return { fonts, totalBytes, totalDuration };
            };

            const buildPreloads = (fonts) => {
                const preloads = [];
                (fonts || []).slice(0, 3).forEach((font) => {
                    const res = fontResources.find((r) => (r.name || '').indexOf(font.family.replace(/['"]/g, '')) !== -1);
                    if (res && res.name) {
                        preloads.push(`<link rel="preload" as="font" href="${res.name}" type="font/${res.name.split('.').pop()}" crossorigin>`);
                    }
                });
                return preloads;
            };

            const buildFontFace = (fonts) => {
                if (!fonts || !fonts.length) return '';
                const first = fonts[0];
                return `@font-face {
  font-family: '${first.family}';
  src: url('path/to/${first.family}.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
            };

            const renderRecos = (fonts) => {
                if (!fontOptRecos) return;
                fontOptRecos.innerHTML = '';
                const recs = [];
                const families = {};
                (fonts || []).forEach((f) => {
                    if (!families[f.family]) families[f.family] = [];
                    families[f.family].push(f.weight);
                });
                Object.entries(families).forEach(([family, weights]) => {
                    const unique = Array.from(new Set(weights));
                    if (unique.length > 3) {
                        recs.push(`${family}: Many weights (${unique.join(', ')}). Remove unused or switch to a variable font.`);
                    }
                });
                if ((fonts || []).length > 0) {
                    recs.push('Set font-display: swap or optional to avoid FOIT.');
                    recs.push('Preload critical fonts used in hero text.');
                    recs.push('Subset fonts to needed characters; avoid loading full glyph sets if not required.');
                    recs.push('Use Font Loading API to load non-critical fonts after first paint.');
                }
                if (!recs.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No recommendations at this time.';
                    row.appendChild(text);
                    fontOptRecos.appendChild(row);
                    return;
                }
                recs.slice(0, 8).forEach((rec) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = rec;
                    row.appendChild(text);
                    fontOptRecos.appendChild(row);
                });
            };

            const simulate = () => {
                if (!fontOptStrategy) return;
                const data = renderFonts();
                const totalMs = data.totalDuration || 0;
                const predicted = Math.round(totalMs * 0.6);
                const lcpImpact = lcpEntry ? (lcpEntry.renderTime || lcpEntry.loadTime || 0) : null;
                const lines = [
                    `Fonts: ${data.fonts.length}`,
                    `Total size: ${formatBytes(data.totalBytes)}`,
                    `Observed load: ~${Math.round(totalMs)} ms`,
                    `Predicted with preload/swap: ~${predicted} ms`,
                    lcpImpact ? `LCP: ${Math.round(lcpImpact)} ms (optimize fonts to reduce)` : '',
                ].filter(Boolean);
                fontOptStrategy.textContent = lines.join('\n');
                renderRecos(data.fonts);
                if (fontOptCode) {
                    const preloads = buildPreloads(data.fonts).join('\n');
                    const ff = buildFontFace(data.fonts);
                    const js = `if ('fonts' in document) { document.fonts.ready.then(() => console.log('Fonts ready')); }`;
                    fontOptCode.textContent = `${ff}\n\n${preloads}\n\n/* JS Font Loading API */\n${js}`;
                }
            };

            const applyStrategy = () => {
                const data = renderFonts();
                const preloads = buildPreloads(data.fonts);
                preloads.forEach((html) => {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = html.trim();
                    const link = tmp.firstChild;
                    if (link) {
                        document.head.appendChild(link);
                    }
                });
                setStatus('Applied font preloads to this page (temporary).', 'success');
            };

            const exportCss = () => {
                const data = renderFonts();
                const preloads = buildPreloads(data.fonts).join('\n');
                const ff = buildFontFace(data.fonts);
                openActionModal({
                    title: 'Font optimization export',
                    message: 'Copy optimized @font-face and preload hints.',
                    code: `${ff}\n\n${preloads}`,
                    copyLabel: 'Copy CSS',
                });
            };

            renderFonts();
            simulate();
            if (fontOptSimBtn) fontOptSimBtn.addEventListener('click', simulate);
            if (fontOptApplyBtn) fontOptApplyBtn.addEventListener('click', applyStrategy);
            if (fontOptExportBtn) fontOptExportBtn.addEventListener('click', exportCss);
        };

        const initPreloadEngine = () => {
            if (!assetsSection) {
                return;
            }
            const card = assetsSection.querySelector('[data-role="preload-card"]');
            if (!card) {
                return;
            }
            const navList = card.querySelector('[data-role="preload-nav"]');
            const hintsPre = card.querySelector('[data-role="preload-hints"] pre') || card.querySelector('[data-role="preload-hints"]');
            const codePre = card.querySelector('[data-role="preload-code"] pre') || card.querySelector('[data-role="preload-code"]');
            const priorityList = card.querySelector('[data-role="preload-priority"]');
            const metaBadge = card.querySelector('[data-role="preload-meta"]');
            const nextCount = card.querySelector('[data-role="preload-next-count"]');
            const hintCount = card.querySelector('[data-role="preload-hint-count"]');
            const wastedCount = card.querySelector('[data-role="preload-wasted"]');
            const savedCount = card.querySelector('[data-role="preload-saved"]');
            const analyzeBtn = card.querySelector('[data-action="run-preload-analysis"]');
            const exportBtn = card.querySelector('[data-action="export-preload-hints"]');
            const applyBtn = card.querySelector('[data-action="apply-preload-test"]');
            const stopBtn = card.querySelector('[data-action="stop-preload-test"]');

            const navKey = 'plugencyNavHistory';
            const navHistory = (() => {
                try {
                    const existing = JSON.parse(localStorage.getItem(navKey) || '[]');
                    const path = window.location.pathname || '/';
                    existing.unshift({ path, ts: Date.now() });
                    const pruned = existing.slice(0, 30);
                    localStorage.setItem(navKey, JSON.stringify(pruned));
                    return pruned;
                } catch (e) {
                    return [];
                }
            })();

            const getHost = (url) => {
                try {
                    return new URL(url, window.location.origin).host;
                } catch (e) {
                    return '';
                }
            };

            const assets = [];
            const addAsset = (item, type) => {
                if (!item) return;
                assets.push({
                    type,
                    handle: item.handle || item.src || '(unknown)',
                    src: item.src || '',
                    bytes: item.bytes || item.size || 0,
                    fetch_ms: item.fetch_ms || 0,
                });
            };
            (snapshotData.styles || []).forEach((s) => addAsset(s, 'style'));
            (snapshotData.scripts || []).forEach((s) => addAsset(s, 'script'));
            const wf = snapshotData.asset_waterfall && Array.isArray(snapshotData.asset_waterfall.top) ? snapshotData.asset_waterfall.top : [];
            wf.forEach((a) => addAsset(a, a.type || 'asset'));

            const scoreAssets = () => assets
                .map((a) => {
                    const critical = a.type === 'style' || a.type === 'script';
                    const sizeWeight = (a.bytes || 0) / (1024 * 50);
                    const timeWeight = (a.fetch_ms || 0) / 100;
                    const score = (critical ? 5 : 0) + sizeWeight + timeWeight;
                    return { ...a, score };
                })
                .sort((a, b) => b.score - a.score);

            const analyzeNavigation = () => {
                const counts = {};
                navHistory.forEach((entry) => {
                    const path = entry.path || '/';
                    counts[path] = (counts[path] || 0) + 1;
                });
                const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
                if (navList) {
                    navList.innerHTML = '';
                    if (!list.length) {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item';
                        const text = document.createElement('span');
                        text.className = 'plugency-source';
                        text.textContent = 'No navigation patterns yet.';
                        row.appendChild(text);
                        navList.appendChild(row);
                    } else {
                        list.forEach(([path, count]) => {
                            const row = document.createElement('div');
                            row.className = 'plugency-list-item plugency-perf-row';
                            const label = document.createElement('div');
                            label.className = 'plugency-path';
                            label.textContent = path;
                            const meta = document.createElement('div');
                            meta.className = 'plugency-accordion-meta';
                            meta.textContent = `${count} visits`;
                            row.appendChild(label);
                            row.appendChild(meta);
                            navList.appendChild(row);
                        });
                    }
                }
                if (nextCount) nextCount.textContent = list.length;
                return list.map(([path]) => path);
            };

            const buildHints = (predictedPaths, scored) => {
                const preloads = [];
                const prefetch = [];
                const preconnect = new Set();
                const fetchPriority = [];

                scored.slice(0, 6).forEach((asset, idx) => {
                    if (!asset.src) return;
                    const asType = asset.type === 'style' ? 'style' : (asset.type === 'script' ? 'script' : 'fetch');
                    preloads.push({ rel: 'preload', as: asType, href: asset.src, priority: idx < 2 ? 'high' : 'auto' });
                    const host = getHost(asset.src);
                    if (host && host !== window.location.host) {
                        preconnect.add(host);
                    }
                    fetchPriority.push({ href: asset.src, priority: idx < 2 ? 'high' : 'low' });
                });
                predictedPaths.slice(0, 4).forEach((path) => {
                    const url = new URL(path, window.location.origin).toString();
                    prefetch.push({ rel: 'prefetch', href: url, as: 'document' });
                });
                return { preloads, prefetch, preconnect: Array.from(preconnect), fetchPriority };
            };

            const renderPriority = (scored) => {
                if (!priorityList) return;
                priorityList.innerHTML = '';
                const top = scored.slice(0, 8);
                if (!top.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No assets scored yet.';
                    row.appendChild(text);
                    priorityList.appendChild(row);
                    return;
                }
                top.forEach((asset, idx) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = asset.handle || asset.src || `(asset ${idx + 1})`;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Score ${asset.score.toFixed(2)} | ${asset.type}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    priorityList.appendChild(row);
                });
            };

            const renderHints = (hints) => {
                if (hintsPre) {
                    const lines = [];
                    hints.preloads.forEach((p) => lines.push(`<link rel="${p.rel}" as="${p.as}" href="${p.href}" fetchpriority="${p.priority || 'auto'}">`));
                    hints.prefetch.forEach((p) => lines.push(`<link rel="prefetch" href="${p.href}" as="${p.as}">`));
                    hints.preconnect.forEach((host) => lines.push(`<link rel="preconnect" href="//${host}" crossorigin>`));
                    hintsPre.textContent = lines.length ? lines.join('\n') : 'No hints generated.';
                }
                if (codePre) {
                    codePre.textContent = (hintsPre ? hintsPre.textContent : '') || 'No code yet.';
                }
                if (hintCount) hintCount.textContent = (hints.preloads.length + hints.prefetch.length + hints.preconnect.length).toString();
            };

            const computeWasted = () => {
                if (!performance || !performance.getEntriesByType) return 0;
                const resources = performance.getEntriesByType('resource') || [];
                const groups = resources.reduce((acc, r) => {
                    const name = r.name || '';
                    const key = name.split('?')[0];
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(r);
                    return acc;
                }, {});
                let wasted = 0;
                Object.values(groups).forEach((entries) => {
                    const hasPreload = entries.some((e) => (e.initiatorType || '').includes('preload'));
                    const hasUse = entries.some((e) => !((e.initiatorType || '').includes('preload') || (e.initiatorType || '').includes('prefetch')));
                    if (hasPreload && !hasUse) {
                        wasted += 1;
                    }
                });
                return wasted;
            };

            const renderMeta = (hints) => {
                if (!metaBadge) return;
                const wasted = computeWasted();
                const tone = wasted > 2 ? 'warn' : 'success';
                metaBadge.classList.remove('neutral', 'warn', 'success');
                metaBadge.classList.add(tone);
                metaBadge.textContent = `${hints.preloads.length + hints.prefetch.length} hints | ${wasted} wasted`;
                if (wastedCount) wastedCount.textContent = wasted.toString();
            };

            const computeSavings = () => {
                if (!performance || !performance.getEntriesByType) return 0;
                const resources = performance.getEntriesByType('resource') || [];
                const preloaded = resources.filter((e) => (e.initiatorType || '').includes('preload'));
                if (!preloaded.length) return 0;
                const durations = preloaded.map((e) => e.duration || 0).filter(Boolean).sort((a, b) => a - b);
                if (!durations.length) return 0;
                const mid = Math.floor(durations.length / 2);
                const median = durations[mid];
                return Math.round(median);
            };

            const runAnalysis = () => {
                const predicted = analyzeNavigation();
                const scored = scoreAssets();
                const hints = buildHints(predicted, scored);
                renderPriority(scored);
                renderHints(hints);
                renderMeta(hints);
                if (savedCount) savedCount.textContent = computeSavings().toString();
                return { predicted, scored, hints };
            };

            const applyTest = () => {
                const result = runAnalysis();
                const links = [];
                result.hints.preconnect.forEach((host) => {
                    const link = document.createElement('link');
                    link.rel = 'preconnect';
                    link.href = `//${host}`;
                    link.crossOrigin = 'anonymous';
                    document.head.appendChild(link);
                    links.push(link);
                });
                result.hints.preloads.forEach((p) => {
                    const link = document.createElement('link');
                    link.rel = 'preload';
                    link.as = p.as;
                    link.href = p.href;
                    if (p.priority) link.fetchPriority = p.priority;
                    document.head.appendChild(link);
                    links.push(link);
                });
                result.hints.prefetch.forEach((p) => {
                    const link = document.createElement('link');
                    link.rel = 'prefetch';
                    link.as = p.as;
                    link.href = p.href;
                    document.head.appendChild(link);
                    links.push(link);
                });
                setStatus(`Applied ${links.length} test hints (not persisted).`, 'success');
                return links;
            };

            let testLinks = [];
            const stopTest = () => {
                testLinks.forEach((l) => l && l.remove());
                testLinks = [];
                setStatus('Preload test hints removed.', 'neutral');
            };

            if (analyzeBtn) analyzeBtn.addEventListener('click', runAnalysis);
            if (exportBtn) exportBtn.addEventListener('click', () => {
                const result = runAnalysis();
                openActionModal({
                    title: 'Resource hint export',
                    message: 'Copy these hints to implement in your theme.',
                    code: JSON.stringify(result.hints, null, 2),
                    copyLabel: 'Copy hints JSON',
                });
            });
            if (applyBtn) applyBtn.addEventListener('click', () => {
                testLinks = applyTest();
            });
            if (stopBtn) stopBtn.addEventListener('click', stopTest);

            setTimeout(runAnalysis, 500);
        };

        const initHeaderAudit = () => {
            if (!requestsSection) {
                return;
            }
            const card = requestsSection.querySelector('[data-role="header-audit-card"]');
            if (!card) {
                return;
            }
            const scoreBadge = card.querySelector('[data-role="header-score"]');
            const scoreSecurity = card.querySelector('[data-role="header-score-security"]');
            const scoreCache = card.querySelector('[data-role="header-score-cache"]');
            const scoreCors = card.querySelector('[data-role="header-score-cors"]');
            const scoreCompress = card.querySelector('[data-role="header-score-compress"]');
            const scoreInfo = card.querySelector('[data-role="header-score-info"]');
            const issuesList = card.querySelector('[data-role="header-issues"]');
            const historyList = card.querySelector('[data-role="header-history"]');
            const summaryPre = card.querySelector('[data-role="header-summary"] pre') || card.querySelector('[data-role="header-summary"]');
            const corsPre = card.querySelector('[data-role="header-cors"] pre') || card.querySelector('[data-role="header-cors"]');
            const htaccessPre = card.querySelector('[data-role="header-config-htaccess"] pre') || card.querySelector('[data-role="header-config-htaccess"]');
            const nginxPre = card.querySelector('[data-role="header-config-nginx"] pre') || card.querySelector('[data-role="header-config-nginx"]');
            const phpPre = card.querySelector('[data-role="header-config-php"] pre') || card.querySelector('[data-role="header-config-php"]');
            const runAuditBtn = card.querySelector('[data-action="run-header-audit"]');
            const applyBtn = card.querySelector('[data-action="apply-security-headers"]');
            const saveBtn = card.querySelector('[data-action="save-header-policy"]');
            const exportBtn = card.querySelector('[data-action="export-header-report"]');
            const copyHtaccessBtn = card.querySelector('[data-action="copy-header-htaccess"]');
            const copyNginxBtn = card.querySelector('[data-action="copy-header-nginx"]');
            const copyPhpBtn = card.querySelector('[data-action="copy-header-php"]');

            const ensureObject = (value) => (value && typeof value === 'object' ? value : {});
            const headerData = snapshotData.headers || {};
            let responseHeaders = ensureObject(headerData.response);
            let requestHeaders = ensureObject(headerData.request || (snapshotData.requests && snapshotData.requests.HEADERS ? snapshotData.requests.HEADERS : {}));
            let headerHistory = Array.isArray(headerData.history) ? headerData.history : [];
            let policy = headerData.policy && typeof headerData.policy === 'object' ? headerData.policy : {};
            const recommended = ensureObject(headerData.recommended || {});

            const normHeaders = (headers) => {
                if (!headers || typeof headers !== 'object') {
                    return {};
                }
                const map = {};
                Object.entries(headers || {}).forEach(([k, v]) => {
                    const key = String(k || '').toLowerCase();
                    map[key] = {
                        name: k,
                        value: Array.isArray(v) ? v.join(', ') : String(v),
                    };
                });
                return map;
            };

            const diffHeaders = (current, prev) => {
                const cur = normHeaders(current);
                const pre = normHeaders(prev);
                let changed = 0;
                Object.keys(cur).forEach((key) => {
                    if (!pre[key] || pre[key].value !== cur[key].value) {
                        changed += 1;
                    }
                });
                Object.keys(pre).forEach((key) => {
                    if (!cur[key]) {
                        changed += 1;
                    }
                });
                return changed;
            };

            const buildConfigs = (headers) => {
                const entries = Object.entries(headers || {});
                if (!entries.length) {
                    return {
                        htaccess: '# No recommended headers available.',
                        nginx: '# No recommended headers available.',
                        php: '// No recommended headers available.',
                    };
                }
                const ht = [];
                const nginx = [];
                const php = [];
                entries.forEach(([name, value]) => {
                    ht.push(`    Header always set ${name} \"${value}\"`);
                    nginx.push(`add_header ${name} \"${value}\" always;`);
                    php.push(`    header('${name}: ${value}');`);
                });
                const cacheHt = [
                    '# Cache policy',
                    '<IfModule mod_expires.c>',
                    '  ExpiresActive On',
                    '  ExpiresByType text/css \"access plus 7 days\"',
                    '  ExpiresByType application/javascript \"access plus 7 days\"',
                    '  ExpiresByType image/webp \"access plus 30 days\"',
                    '  ExpiresDefault \"access plus 10 minutes\"',
                    '</IfModule>',
                ];
                const cacheNginx = [
                    '# Cache policy',
                    'location ~* \\.(?:js|css|png|jpg|jpeg|gif|svg|webp|avif)$ {',
                    '  expires 7d;',
                    '  add_header Cache-Control \"public, max-age=604800\";',
                    '}',
                ];
                const htSnippet = `<IfModule mod_headers.c>\n${ht.join('\n')}\n</IfModule>\n<IfModule mod_deflate.c>\n  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml\n</IfModule>\n${cacheHt.join('\n')}`;
                const nginxSnippet = `${nginx.join('\n')}\n\n# Compression\ngzip on;\ngzip_types text/html text/css application/javascript application/json image/svg+xml;\n${cacheNginx.join('\n')}`;
                const phpSnippet = `add_action('send_headers', function () {\n${php.join('\n')}\n});`;
                return { htaccess: htSnippet, nginx: nginxSnippet, php: phpSnippet };
            };

            const evaluateHeaders = () => {
                const resp = responseHeaders || {};
                const lower = normHeaders(resp);
                const issues = [];
                const scoreParts = {
                    security: 100,
                    cache: 100,
                    cors: 100,
                    compression: 100,
                    disclosure: 100,
                };
                const required = {
                    'content-security-policy': 'Content-Security-Policy',
                    'x-content-type-options': 'X-Content-Type-Options',
                    'x-frame-options': 'X-Frame-Options',
                    'referrer-policy': 'Referrer-Policy',
                    'permissions-policy': 'Permissions-Policy',
                };
                Object.entries(required).forEach(([key, label]) => {
                    if (!lower[key]) {
                        scoreParts.security -= 12;
                        issues.push({ text: `${label} missing`, severity: 'error' });
                    }
                });
                ['cross-origin-opener-policy', 'cross-origin-resource-policy', 'cross-origin-embedder-policy'].forEach((key) => {
                    if (!lower[key]) {
                        scoreParts.security -= 6;
                        issues.push({ text: `${key.replace(/-/g, ' ')} missing`, severity: 'warn' });
                    }
                });
                if (window.location.protocol === 'https:' && !lower['strict-transport-security']) {
                    scoreParts.security -= 10;
                    issues.push({ text: 'HSTS missing (Strict-Transport-Security)', severity: 'warn' });
                }
                if (lower['content-security-policy'] && /unsafe-inline/.test(lower['content-security-policy'].value || '')) {
                    scoreParts.security -= 5;
                    issues.push({ text: 'CSP allows inline scripts/styles (unsafe-inline).', severity: 'warn' });
                }

                const cacheControl = lower['cache-control'] ? lower['cache-control'].value.toLowerCase() : '';
                const pragma = lower['pragma'] ? lower['pragma'].value.toLowerCase() : '';
                if (!cacheControl) {
                    scoreParts.cache -= 25;
                    issues.push({ text: 'Cache-Control missing; responses may be unbounded.', severity: 'error' });
                } else {
                    if (!/max-age/.test(cacheControl) && !/s-maxage/.test(cacheControl)) {
                        scoreParts.cache -= 8;
                        issues.push({ text: 'Cache-Control lacks explicit max-age/s-maxage.', severity: 'warn' });
                    }
                    if (/no-store/.test(cacheControl) && /max-age=\d+/.test(cacheControl)) {
                        scoreParts.cache -= 8;
                        issues.push({ text: 'Cache-Control mixes no-store with max-age (conflict).', severity: 'warn' });
                    }
                    if (/private/.test(cacheControl) && /public/.test(cacheControl)) {
                        scoreParts.cache -= 5;
                        issues.push({ text: 'Cache-Control lists both public and private.', severity: 'warn' });
                    }
                }
                if (pragma && cacheControl && /no-cache/.test(pragma) && !/no-cache/.test(cacheControl)) {
                    scoreParts.cache -= 4;
                    issues.push({ text: 'Pragma: no-cache conflicts with Cache-Control.', severity: 'warn' });
                }

                const allowOrigin = lower['access-control-allow-origin'] ? lower['access-control-allow-origin'].value : '';
                if (!allowOrigin) {
                    scoreParts.cors -= 10;
                    issues.push({ text: 'CORS allow-origin missing (cross-site API access blocked).', severity: 'warn' });
                } else if (allowOrigin === '*') {
                    scoreParts.cors -= 4;
                    issues.push({ text: 'CORS allows any origin; ensure non-sensitive endpoints.', severity: 'warn' });
                }

                const encoding = lower['content-encoding'] ? lower['content-encoding'].value.toLowerCase() : '';
                if (!encoding) {
                    scoreParts.compression -= 10;
                    issues.push({ text: 'No compression header (gzip/br) detected.', severity: 'warn' });
                } else if (!/br|gzip/.test(encoding)) {
                    scoreParts.compression -= 6;
                    issues.push({ text: `Compression uses ${encoding}; prefer gzip/br.`, severity: 'warn' });
                }

                ['server', 'x-powered-by', 'x-generator'].forEach((name) => {
                    if (lower[name]) {
                        scoreParts.disclosure -= 12;
                        issues.push({ text: `${lower[name].name} exposes infrastructure details (${lower[name].value}).`, severity: 'warn' });
                    }
                });

                Object.entries(resp || {}).forEach(([name, value]) => {
                    const parts = String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
                    if (parts.length > 1 && parts.length !== new Set(parts).size) {
                        issues.push({ text: `${name} repeats identical directives`, severity: 'info' });
                    }
                });

                const overall = Math.max(0, Math.min(100, Math.round((scoreParts.security + scoreParts.cache + scoreParts.cors + scoreParts.compression + scoreParts.disclosure) / 5)));
                return {
                    score: overall,
                    parts: scoreParts,
                    issues,
                    cacheControl: cacheControl || '(none)',
                    allowOrigin: allowOrigin || '(none)',
                    encoding: encoding || '(none)',
                };
            };

            const renderScore = (result) => {
                if (!result) {
                    return;
                }
                const tone = result.score >= 85 ? 'success' : (result.score >= 65 ? 'warn' : 'error');
                if (scoreBadge) {
                    scoreBadge.textContent = `Score: ${result.score}`;
                    scoreBadge.classList.remove('success', 'warn', 'error', 'neutral');
                    scoreBadge.classList.add(tone);
                }
                const setField = (el, value) => {
                    if (el) {
                        el.textContent = `${Math.max(0, Math.min(100, Math.round(value)))}`;
                    }
                };
                setField(scoreSecurity, result.parts.security);
                setField(scoreCache, result.parts.cache);
                setField(scoreCors, result.parts.cors);
                setField(scoreCompress, result.parts.compression);
                setField(scoreInfo, result.parts.disclosure);
            };

            const renderIssues = (issues) => {
                if (!issuesList) {
                    return;
                }
                issuesList.innerHTML = '';
                if (!issues || !issues.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'Headers look solid. Nothing critical to fix.';
                    row.appendChild(text);
                    issuesList.appendChild(row);
                    return;
                }
                issues.forEach((issue) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = issue.text || 'Issue';
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    if (issue.severity === 'error') {
                        pill.classList.add('error');
                        pill.textContent = 'High';
                    } else if (issue.severity === 'warn') {
                        pill.classList.add('warn');
                        pill.textContent = 'Warn';
                    } else {
                        pill.classList.add('neutral');
                        pill.textContent = 'Info';
                    }
                    row.appendChild(label);
                    row.appendChild(pill);
                    issuesList.appendChild(row);
                });
            };

            const renderHistory = () => {
                if (!historyList) {
                    return;
                }
                historyList.innerHTML = '';
                const items = headerHistory.slice(0, 8);
                if (!items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No header changes recorded yet.';
                    row.appendChild(text);
                    historyList.appendChild(row);
                    return;
                }
                items.forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.time ? new Date(item.time).toLocaleString() : 'Unknown time';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const delta = idx < items.length - 1 ? diffHeaders(item.response || {}, items[idx + 1].response || {}) : 0;
                    const uri = item.uri || '/';
                    meta.textContent = `${item.response_count || 0} headers | Δ ${delta} | ${uri}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    historyList.appendChild(row);
                });
            };

            const renderSummary = (result) => {
                if (!summaryPre) {
                    return;
                }
                const lines = [];
                lines.push(`Request headers: ${Object.keys(requestHeaders || {}).length}`);
                lines.push(`Response headers: ${Object.keys(responseHeaders || {}).length}`);
                lines.push(`Cache: ${result.cacheControl}`);
                lines.push(`CORS: ${result.allowOrigin}`);
                lines.push(`Compression: ${result.encoding}`);
                if (policy && policy.enabled) {
                    const count = Object.keys(policy.headers || {}).length;
                    lines.push(`Policy active: ${count} headers set via send_headers`);
                }
                summaryPre.textContent = lines.join('\n');
            };

            const renderConfigs = () => {
                const configs = buildConfigs(Object.keys(recommended || {}).length ? recommended : policy.headers || recommended);
                if (htaccessPre) {
                    htaccessPre.textContent = configs.htaccess;
                }
                if (nginxPre) {
                    nginxPre.textContent = configs.nginx;
                }
                if (phpPre) {
                    phpPre.textContent = configs.php;
                }
            };

            const testCors = () => {
                if (!corsPre || !window.fetch) {
                    return;
                }
                const start = performance.now();
                const url = (state.homeUrl || window.location.origin) + '/wp-json/';
                corsPre.textContent = 'Testing /wp-json for CORS and compression...';
                fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
                    .then((res) => res.text().then((body) => ({ res, body })))
                    .then(({ res }) => {
                        const elapsed = Math.round(performance.now() - start);
                        const origin = res.headers.get('access-control-allow-origin') || '(none)';
                        const methods = res.headers.get('access-control-allow-methods') || '(none)';
                        const encoding = res.headers.get('content-encoding') || '(none)';
                        const corsLine = `CORS /wp-json/: origin=${origin} methods=${methods} status=${res.status} t=${elapsed}ms enc=${encoding}`;
                        corsPre.textContent = corsLine;
                    })
                    .catch((err) => {
                        corsPre.textContent = `CORS probe failed: ${err.message}`;
                    });
            };

            const exportHeaderReport = (result) => {
                const payload = {
                    captured_at: new Date().toISOString(),
                    request_headers: requestHeaders,
                    response_headers: responseHeaders,
                    policy,
                    recommended,
                    score: result,
                    history: headerHistory,
                };
                openActionModal({
                    title: 'Header audit export',
                    message: 'Copy the full header audit payload.',
                    code: JSON.stringify(payload, null, 2),
                    copyLabel: 'Copy audit JSON',
                });
            };

            const saveHeaderPolicy = () => {
                if (!saveBtn) {
                    return;
                }
                setLoading(saveBtn, true, 'Saving...');
                const toSave = Object.assign({}, recommended || {}, responseHeaders || {});
                post('plugency_save_security_headers', {
                    headers: JSON.stringify(toSave),
                    enable: '1',
                }).then((data) => {
                    policy = data.policy || policy;
                    setStatus('Current headers saved to send_headers (server-side).', 'success');
                }).catch((err) => {
                    setStatus(err.message, 'error');
                }).finally(() => setLoading(saveBtn, false));
            };

            const applySecurityHeaders = () => {
                if (!applyBtn) {
                    return;
                }
                setLoading(applyBtn, true, 'Hardening...');
                post('plugency_apply_security_headers', {})
                    .then((data) => {
                        policy = data.policy || policy;
                        setStatus('Recommended security headers will be applied on the next response.', 'success');
                    })
                    .catch((err) => {
                        setStatus(err.message, 'error');
                    })
                    .finally(() => setLoading(applyBtn, false));
            };

            const runAudit = () => {
                const result = evaluateHeaders();
                renderScore(result);
                renderIssues(result.issues);
                renderHistory();
                renderSummary(result);
                renderConfigs();
                testCors();
                return result;
            };

            if (runAuditBtn) {
                runAuditBtn.addEventListener('click', runAudit);
            }
            if (applyBtn) {
                applyBtn.addEventListener('click', applySecurityHeaders);
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', saveHeaderPolicy);
            }
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    const result = evaluateHeaders();
                    exportHeaderReport(result);
                });
            }
            if (copyHtaccessBtn) {
                copyHtaccessBtn.addEventListener('click', () => {
                    const configs = buildConfigs(Object.keys(recommended || {}).length ? recommended : policy.headers || recommended);
                    copyHtmlSnippet(configs.htaccess, 'Copied .htaccess snippet.', '.htaccess headers', copyHtaccessBtn);
                });
            }
            if (copyNginxBtn) {
                copyNginxBtn.addEventListener('click', () => {
                    const configs = buildConfigs(Object.keys(recommended || {}).length ? recommended : policy.headers || recommended);
                    copyHtmlSnippet(configs.nginx, 'Copied Nginx snippet.', 'Nginx headers', copyNginxBtn);
                });
            }
            if (copyPhpBtn) {
                copyPhpBtn.addEventListener('click', () => {
                    const configs = buildConfigs(Object.keys(recommended || {}).length ? recommended : policy.headers || recommended);
                    copyHtmlSnippet(configs.php, 'Copied PHP snippet.', 'PHP headers', copyPhpBtn);
                });
            }

            runAudit();
        };

        const initCriticalCss = () => {
            if (!assetsSection) {
                return;
            }

            const analyzeBtn = assetsSection.querySelector('[data-action="analyze-critical-css"]');
            const copyInlineBtn = assetsSection.querySelector('[data-action="copy-critical-inline"]');
            const copyExternalBtn = assetsSection.querySelector('[data-action="copy-critical-external"]');
            const copyHeadBtn = assetsSection.querySelector('[data-action="copy-critical-head"]');
            const outputPre = assetsSection.querySelector('[data-role="critical-css-output"] pre');
            const statusNode = assetsSection.querySelector('[data-role="critical-css-status"]');
            const metaBadge = assetsSection.querySelector('[data-role="critical-css-meta"]');
            const statOriginal = assetsSection.querySelector('[data-role="critical-css-original"]');
            const statCritical = assetsSection.querySelector('[data-role="critical-css-critical"]');
            const statSavings = assetsSection.querySelector('[data-role="critical-css-savings"]');
            const statLcp = assetsSection.querySelector('[data-role="critical-css-lcp"]');
            const deferList = assetsSection.querySelector('[data-role="critical-css-defer-list"]');
            const assetsTab = Array.from(tabs || []).find((tab) => tab.getAttribute('data-tab') === 'assets');

            let criticalCss = '';
            let headSnippet = '';
            let externalCss = '';
            let lcpEstimate = '';
            let autoTriggered = false;

            const setBadge = (text, tone = 'neutral') => {
                if (!metaBadge) {
                    return;
                }
                metaBadge.textContent = text;
                metaBadge.classList.remove('success', 'warn', 'neutral');
                metaBadge.classList.add(tone);
            };

            const setStatusText = (text, tone = 'neutral') => {
                if (statusNode) {
                    statusNode.textContent = text;
                    statusNode.className = `plugency-small ${tone}`;
                }
            };

            const formatBytes = (val) => {
                const num = Number(val) || 0;
                if (num <= 0) {
                    return '0 B';
                }
                if (num >= 1024 * 1024) {
                    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
                }
                if (num >= 1024) {
                    return `${(num / 1024).toFixed(1)} KB`;
                }
                return `${Math.round(num)} B`;
            };

            const normalizeUrl = (url) => {
                if (!url) {
                    return '';
                }
                try {
                    return new URL(url, window.location.href).href.split('#')[0];
                } catch (e) {
                    return (url || '').split('#')[0];
                }
            };

            const buildStyleIndex = () => {
                const index = new Map();
                (snapshotData.styles || []).forEach((style) => {
                    const key = normalizeUrl(style.src || '');
                    if (key) {
                        index.set(key, style);
                        const noQuery = key.split('?')[0];
                        if (noQuery && !index.has(noQuery)) {
                            index.set(noQuery, style);
                        }
                    }
                });
                return index;
            };

            const collectAboveFoldElements = (limit = 240) => {
                const cutoff = (window.innerHeight || document.documentElement.clientHeight || 0) + Math.max(160, (window.innerHeight || 0) * 0.1);
                const elements = Array.from(document.body ? document.body.querySelectorAll('*') : []);
                const filtered = [];
                for (let i = 0; i < elements.length; i += 1) {
                    if (filtered.length >= limit) {
                        break;
                    }
                    const el = elements[i];
                    if (!(el instanceof Element)) {
                        continue;
                    }
                    if (el.closest('#plugencyDebugPanel') || el.closest('#plugencyDebugLauncher') || el.closest('.plugency-inspect-tools')) {
                        continue;
                    }
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) {
                        continue;
                    }
                    if (rect.top > cutoff || rect.bottom < 0) {
                        continue;
                    }
                    filtered.push(el);
                }
                return filtered;
            };

            const minifyCss = (css) => css
                .replace(/\/\*[^!][\s\S]*?\*\//g, '')
                .replace(/\s+/g, ' ')
                .replace(/\s*([:;{},])\s*/g, '$1')
                .replace(/;}/g, '}')
                .trim();

            const matchesAny = (selector, elements) => {
                const list = Array.isArray(elements) ? elements : [];
                for (let i = 0; i < list.length; i += 1) {
                    const el = list[i];
                    try {
                        if (el.matches(selector)) {
                            return true;
                        }
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            };

            const estimateLcpGain = (bytesSaved) => {
                const kb = bytesSaved / 1024;
                if (kb <= 0) {
                    return '0 ms';
                }
                const estimate = Math.min(1500, Math.round(kb * 4 + 120));
                return `${estimate} ms`;
            };

            const renderDeferList = (items, blocked = 0) => {
                if (!deferList) {
                    return;
                }
                deferList.innerHTML = '';
                if ((!items || !items.length) && !blocked) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No obvious defer candidates. All styles touched above the fold.';
                    row.appendChild(text);
                    deferList.appendChild(row);
                    return;
                }
                (items || []).forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const title = document.createElement('div');
                    title.className = 'plugency-path';
                    title.textContent = item.name || item.src || '(style)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    const parts = [];
                    if (item.src) {
                        parts.push(item.src);
                    }
                    if (typeof item.bytes === 'number') {
                        parts.push(formatBytes(item.bytes));
                    }
                    meta.textContent = parts.join(' | ');
                    row.appendChild(title);
                    row.appendChild(meta);
                    deferList.appendChild(row);
                });
                if (blocked) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = `${blocked} stylesheet${blocked === 1 ? '' : 's'} were skipped (CORS). Add crossorigin headers to include them.`;
                    row.appendChild(text);
                    deferList.appendChild(row);
                }
            };

            const updateStats = (originalBytes, criticalBytes, savingsBytes, lcpText) => {
                if (statOriginal) {
                    statOriginal.textContent = formatBytes(originalBytes);
                }
                if (statCritical) {
                    statCritical.textContent = formatBytes(criticalBytes);
                }
                if (statSavings) {
                    statSavings.textContent = `${formatBytes(Math.max(0, savingsBytes))}`;
                }
                if (statLcp) {
                    statLcp.textContent = lcpText;
                }
            };

            const extractCriticalCss = () => {
                const aboveFold = collectAboveFoldElements();
                const sheets = Array.from(document.styleSheets || []);
                const styleIndex = buildStyleIndex();
                const parts = [];
                const usage = new Map();
                const usedKeyframes = new Set();
                let blocked = 0;
                let ruleCount = 0;
                const ruleLimit = 3500;

                const addRuleText = (text, wrapper = '') => {
                    if (!text) {
                        return;
                    }
                    if (wrapper) {
                        parts.push(`${wrapper}{${text}}`);
                    } else {
                        parts.push(text);
                    }
                };

                const walkRules = (rules, wrapper = '') => {
                    Array.from(rules || []).forEach((rule) => {
                        if (ruleCount >= ruleLimit) {
                            return;
                        }
                        switch (rule.type) {
                            case CSSRule.STYLE_RULE: {
                                ruleCount += 1;
                                const selector = rule.selectorText || '';
                                if (!selector) {
                                    return;
                                }
                                const owner = rule.parentStyleSheet;
                                const href = owner ? normalizeUrl(owner.href || '') : 'inline';
                                const meta = usage.get(href) || { matched: 0, total: 0, href };
                                meta.total += 1;
                                usage.set(href, meta);
                                const matched = matchesAny(selector, aboveFold);
                                if (!matched) {
                                    return;
                                }
                                meta.matched += 1;
                                usage.set(href, meta);
                                const txt = rule.cssText || `${selector}{${rule.style.cssText}}`;
                                if (rule.style && rule.style.animationName && rule.style.animationName !== 'none') {
                                    rule.style.animationName.split(',').map((s) => s.trim()).filter(Boolean).forEach((name) => usedKeyframes.add(name));
                                }
                                addRuleText(txt, wrapper);
                                break;
                            }
                            case CSSRule.MEDIA_RULE:
                                ruleCount += 1;
                                walkRules(rule.cssRules, `@media ${rule.conditionText}`);
                                break;
                            case CSSRule.SUPPORTS_RULE:
                                ruleCount += 1;
                                walkRules(rule.cssRules, `@supports ${rule.conditionText}`);
                                break;
                            case CSSRule.FONT_FACE_RULE:
                                ruleCount += 1;
                                addRuleText(rule.cssText, wrapper);
                                break;
                            case CSSRule.KEYFRAMES_RULE:
                                ruleCount += 1;
                                if (!rule.name || !usedKeyframes.size || usedKeyframes.has(rule.name)) {
                                    addRuleText(rule.cssText, wrapper);
                                }
                                break;
                            default:
                                break;
                        }
                    });
                };

                sheets.forEach((sheet) => {
                    if (!sheet) {
                        return;
                    }
                    let rules;
                    try {
                        rules = sheet.cssRules;
                    } catch (e) {
                        blocked += 1;
                        return;
                    }
                    if (!rules) {
                        return;
                    }
                    const href = normalizeUrl(sheet.href || 'inline');
                    if (!usage.has(href)) {
                        usage.set(href, { matched: 0, total: 0, href });
                    }
                    walkRules(rules, '');
                });

                const combined = minifyCss(parts.join(''));
                const originalBytes = (snapshotData.styles || []).reduce((total, style) => total + (style.bytes || 0), 0) || combined.length;
                const criticalBytes = combined.length;
                const savings = Math.max(0, originalBytes - criticalBytes);
                const lcpText = estimateLcpGain(savings);

                const deferCandidates = [];
                usage.forEach((meta, href) => {
                    if (meta && meta.matched === 0 && meta.total > 0 && href !== 'inline') {
                        const styleMeta = styleIndex.get(href) || {};
                        deferCandidates.push({
                            name: styleMeta.handle || styleMeta.src || href || 'style',
                            src: styleMeta.src || href,
                            bytes: styleMeta.bytes || null,
                        });
                    }
                });

                return {
                    css: combined,
                    deferCandidates,
                    blocked,
                    stats: { originalBytes, criticalBytes, savings, lcpText },
                };
            };

            const handleAnalysisResult = (result) => {
                if (!result) {
                    setStatusText('Unable to build critical CSS.', 'error');
                    return;
                }
                criticalCss = result.css || '';
                externalCss = criticalCss;
                lcpEstimate = result.stats.lcpText;
                headSnippet = (() => {
                    const deferLinks = (result.deferCandidates || []).map((item) => {
                        if (!item.src) {
                            return '';
                        }
                        return `<link rel=\"preload\" as=\"style\" href=\"${item.src}\" onload=\"this.onload=null;this.rel='stylesheet'\">\n<noscript><link rel=\"stylesheet\" href=\"${item.src}\"></noscript>`;
                    }).filter(Boolean).join('\n    ');
                    return `add_action('wp_head', function () {\n    ?>\n    <style id=\"plugency-critical-css\">${criticalCss}</style>\n    ${deferLinks || '<!-- Defer remaining stylesheets here -->'}\n    <?php\n});`;
                })();
                if (outputPre) {
                    outputPre.textContent = criticalCss || 'No matching rules found for above-the-fold content.';
                }
                updateStats(result.stats.originalBytes, result.stats.criticalBytes, result.stats.savings, result.stats.lcpText);
                renderDeferList(result.deferCandidates, result.blocked);
                setBadge(criticalCss ? 'Ready' : 'No match', criticalCss ? 'success' : 'warn');
                setStatusText(criticalCss ? 'Critical CSS extracted. Copy a snippet below.' : 'No matching rules found above the fold.', criticalCss ? 'neutral' : 'warn');
                [copyInlineBtn, copyExternalBtn, copyHeadBtn].forEach((btn) => {
                    if (btn) {
                        btn.disabled = !criticalCss;
                    }
                });
            };

            const runAnalysis = () => {
                if (!analyzeBtn) {
                    return;
                }
                setLoading(analyzeBtn, true, 'Analyzing...');
                setBadge('Scanning', 'neutral');
                setStatusText('Scanning stylesheets and above-the-fold elements...', 'neutral');
                const doWork = () => {
                    const result = extractCriticalCss();
                    handleAnalysisResult(result);
                    setLoading(analyzeBtn, false);
                };
                if (window.requestIdleCallback) {
                    requestIdleCallback(doWork, { timeout: 800 });
                } else {
                    setTimeout(doWork, 30);
                }
            };

            if (analyzeBtn) {
                analyzeBtn.addEventListener('click', () => {
                    autoTriggered = true;
                    runAnalysis();
                });
            }

            if (copyInlineBtn) {
                copyInlineBtn.addEventListener('click', () => {
                    if (!criticalCss) {
                        setStatus('Run the analyzer first to copy inline CSS.', 'error');
                        return;
                    }
                    const snippet = `<style id=\"plugency-critical-css\">${criticalCss}</style>`;
                    copyHtmlSnippet(snippet, 'Inline critical CSS copied.', 'Inline critical CSS', copyInlineBtn);
                });
            }

            if (copyExternalBtn) {
                copyExternalBtn.addEventListener('click', () => {
                    if (!externalCss) {
                        setStatus('Run the analyzer first to copy CSS.', 'error');
                        return;
                    }
                    const snippet = `/* critical.css */\n${externalCss}`;
                    copyHtmlSnippet(snippet, 'Critical CSS copied.', 'Critical CSS', copyExternalBtn);
                });
            }

            if (copyHeadBtn) {
                copyHeadBtn.addEventListener('click', () => {
                    if (!criticalCss || !headSnippet) {
                        setStatus('Run the analyzer first to generate wp_head snippet.', 'error');
                        return;
                    }
                    copyHtmlSnippet(headSnippet, 'wp_head snippet copied.', 'wp_head critical CSS', copyHeadBtn);
                });
            }

            const autoAnalyzeOnce = () => {
                if (autoTriggered || !state.isFrontend) {
                    return;
                }
                autoTriggered = true;
                setTimeout(runAnalysis, 180);
            };

            if (assetsTab) {
                assetsTab.addEventListener('click', autoAnalyzeOnce, { once: true });
            }

            if (state.isFrontend) {
                setTimeout(() => {
                    autoAnalyzeOnce();
                }, 1600);
            }
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
            thirdGovCard = performanceSection.querySelector('[data-role="third-party-governance"]');
            const thirdGovMeta = thirdGovCard ? thirdGovCard.querySelector('[data-role="third-party-meta"]') : null;
            const thirdGovList = thirdGovCard ? thirdGovCard.querySelector('[data-role="third-party-list"]') : null;
            const thirdGovStrategy = thirdGovCard ? thirdGovCard.querySelector('[data-role="third-party-strategy"]') : null;
            thirdGovExport = thirdGovCard ? thirdGovCard.querySelector('[data-action="export-third-report"]') : null;
            thirdGovFacade = thirdGovCard ? thirdGovCard.querySelector('[data-action="apply-facades"]') : null;
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
            const optimizerSlider = performanceSection.querySelector('[data-role="optimizer-slider"]');
            const optimizerBefore = performanceSection.querySelector('[data-role="optimizer-before"]');
            const optimizerAfter = performanceSection.querySelector('[data-role="optimizer-after"]');
            const optimizerProgress = performanceSection.querySelector('[data-role="optimizer-progress"]');
            const optimizerProgressBar = performanceSection.querySelector('[data-role="optimizer-progress-bar"]');
            const optimizerProgressLabel = performanceSection.querySelector('[data-role="optimizer-progress-label"]');
            const optimizerLighthouse = performanceSection.querySelector('[data-role="optimizer-lighthouse"]');
            const optimizerBulkBtn = performanceSection.querySelector('[data-action="start-bulk-optimization"]');
            const optimizerRollbackBtn = performanceSection.querySelector('[data-action="rollback-optimization"]');
            bundleCard = performanceSection.querySelector('[data-role="bundle-analyzer-card"]');
            const bundleMeta = bundleCard ? bundleCard.querySelector('[data-role="bundle-analyzer-meta"]') : null;
            const bundleTreemap = bundleCard ? bundleCard.querySelector('[data-role="bundle-treemap"]') : null;
            const bundleTreemapWrapper = bundleCard ? bundleCard.querySelector('[data-role="bundle-treemap-wrapper"]') : null;
            const bundleFindings = bundleCard ? bundleCard.querySelector('[data-role="bundle-findings"]') : null;
            const bundleDuplicates = bundleCard ? bundleCard.querySelector('[data-role="bundle-duplicates"]') : null;
            const bundleDeps = bundleCard ? bundleCard.querySelector('[data-role="bundle-deps"] pre') : null;
            bundleExportBtn = bundleCard ? bundleCard.querySelector('[data-action="export-bundle-report"]') : null;
            a11yCard = performanceSection.querySelector('[data-role="a11y-card"]');
            const a11yIssues = a11yCard ? a11yCard.querySelector('[data-role="a11y-issues"]') : null;
            const a11yScoreBadge = a11yCard ? a11yCard.querySelector('[data-role="a11y-score"]') : null;
            a11yRunBtn = a11yCard ? a11yCard.querySelector('[data-action="run-a11y-audit"]') : null;
            a11yFixBtn = a11yCard ? a11yCard.querySelector('[data-action="fix-a11y-common"]') : null;
            a11yExportBtn = a11yCard ? a11yCard.querySelector('[data-action="export-a11y-report"]') : null;
            const formCard = performanceSection.querySelector('[data-role="form-ux-card"]');
            const formHeatmap = formCard ? formCard.querySelector('[data-role="form-heatmap"]') : null;
            const formFunnel = formCard ? formCard.querySelector('[data-role="form-funnel"]') : null;
            const formValidationCanvas = formCard ? formCard.querySelector('[data-role="form-validation"]') : null;
            const formAbandon = formCard ? formCard.querySelector('[data-role="form-abandon-rate"]') : null;
            const formSuccess = formCard ? formCard.querySelector('[data-role="form-success-rate"]') : null;
            const formLoad = formCard ? formCard.querySelector('[data-role="form-load-time"]') : null;
            const formSpam = formCard ? formCard.querySelector('[data-role="form-spam"]') : null;
            const formRecos = formCard ? formCard.querySelector('[data-role="form-recos"]') : null;
            const formMeta = formCard ? formCard.querySelector('[data-role="form-meta"]') : null;
            const formVariantBadge = formCard ? formCard.querySelector('[data-role="form-variant"]') : null;
            const formAssignBtn = formCard ? formCard.querySelector('[data-action="assign-form-variant"]') : null;
            const formResetBtn = formCard ? formCard.querySelector('[data-action="clear-form-variant"]') : null;
            const formExportBtn = formCard ? formCard.querySelector('[data-action="export-form-report"]') : null;
            const fontOptCard = performanceSection.querySelector('[data-role="font-optimizer-card"]');
            const fontOptList = fontOptCard ? fontOptCard.querySelector('[data-role="font-opt-list"]') : null;
            const fontOptStrategy = fontOptCard ? fontOptCard.querySelector('[data-role="font-opt-strategy"] pre') || fontOptCard.querySelector('[data-role="font-opt-strategy"]') : null;
            const fontOptRecos = fontOptCard ? fontOptCard.querySelector('[data-role="font-opt-recos"]') : null;
            const fontOptCode = fontOptCard ? fontOptCard.querySelector('[data-role="font-opt-code"] pre') || fontOptCard.querySelector('[data-role="font-opt-code"]') : null;
            const fontOptMeta = fontOptCard ? fontOptCard.querySelector('[data-role="font-opt-meta"]') : null;
            const fontOptSimBtn = fontOptCard ? fontOptCard.querySelector('[data-action="font-opt-simulate"]') : null;
            const fontOptApplyBtn = fontOptCard ? fontOptCard.querySelector('[data-action="font-opt-apply"]') : null;
            const fontOptExportBtn = fontOptCard ? fontOptCard.querySelector('[data-action="font-opt-export"]') : null;
            const wcCard = performanceSection.querySelector('[data-role="wc-perf-card"]');
            const wcMeta = wcCard ? wcCard.querySelector('[data-role="wc-perf-meta"]') : null;
            const wcCartList = wcCard ? wcCard.querySelector('[data-role="wc-cart-checkout"]') : null;
            const wcQueryList = wcCard ? wcCard.querySelector('[data-role="wc-query-list"]') : null;
            const wcDbList = wcCard ? wcCard.querySelector('[data-role="wc-db-list"]') : null;
            const wcRecos = wcCard ? wcCard.querySelector('[data-role="wc-recos"]') : null;
            const wcRefreshBtn = wcCard ? wcCard.querySelector('[data-action="wc-perf-refresh"]') : null;
            const wcExportBtn = wcCard ? wcCard.querySelector('[data-action="wc-perf-export"]') : null;
            const schemaCard = performanceSection.querySelector('[data-role="schema-card"]');
            const schemaList = schemaCard ? schemaCard.querySelector('[data-role="schema-list"]') : null;
            const schemaErrors = schemaCard ? schemaCard.querySelector('[data-role="schema-errors"]') : null;
            const schemaEditor = schemaCard ? schemaCard.querySelector('[data-role="schema-editor"]') : null;
            const schemaTemplateSelect = schemaCard ? schemaCard.querySelector('[data-role="schema-template"]') : null;
            const schemaPreview = schemaCard ? schemaCard.querySelector('[data-role="schema-preview"] pre') || schemaCard.querySelector('[data-role="schema-preview"]') : null;
            const schemaTemplatesPre = schemaCard ? schemaCard.querySelector('[data-role="schema-templates"] pre') || schemaCard.querySelector('[data-role="schema-templates"]') : null;
            const schemaMeta = schemaCard ? schemaCard.querySelector('[data-role="schema-meta"]') : null;
            const schemaValidateBtn = schemaCard ? schemaCard.querySelector('[data-action="schema-validate"]') : null;
            const schemaExportBtn = schemaCard ? schemaCard.querySelector('[data-action="schema-export"]') : null;
            const schemaApplyBtn = schemaCard ? schemaCard.querySelector('[data-action="schema-apply-template"]') : null;
            const schemaPreviewBtn = schemaCard ? schemaCard.querySelector('[data-action="schema-preview"]') : null;
            const pwaCard = performanceSection.querySelector('[data-role="pwa-card"]');
            const pwaMeta = pwaCard ? pwaCard.querySelector('[data-role="pwa-meta"]') : null;
            const pwaSwStatus = pwaCard ? pwaCard.querySelector('[data-role="pwa-sw-status"]') : null;
            const pwaCacheList = pwaCard ? pwaCard.querySelector('[data-role="pwa-cache-list"]') : null;
            const pwaChecklist = pwaCard ? pwaCard.querySelector('[data-role="pwa-checklist"]') : null;
            const pwaPush = pwaCard ? pwaCard.querySelector('[data-role="pwa-push"] pre') || pwaCard.querySelector('[data-role="pwa-push"]') : null;
            const pwaInstall = pwaCard ? pwaCard.querySelector('[data-role="pwa-install"] pre') || pwaCard.querySelector('[data-role="pwa-install"]') : null;
            const pwaRefreshBtn = pwaCard ? pwaCard.querySelector('[data-action="pwa-refresh"]') : null;
            const pwaOfflineBtn = pwaCard ? pwaCard.querySelector('[data-action="pwa-offline-toggle"]') : null;
            const pwaClearCacheBtn = pwaCard ? pwaCard.querySelector('[data-action="pwa-clear-cache"]') : null;
            const pwaCheckUpdateBtn = pwaCard ? pwaCard.querySelector('[data-action="pwa-check-updates"]') : null;
            const budgetCard = performanceSection.querySelector('[data-role="perf-budget-card"]');
            const budgetStatus = budgetCard ? budgetCard.querySelector('[data-role="perf-budget-status"]') : null;
            const budgetNote = budgetCard ? budgetCard.querySelector('[data-role="perf-budget-note"]') : null;
            const budgetInputs = budgetCard ? budgetCard.querySelectorAll('[data-budget-key]') : [];
            const budgetBars = budgetCard ? budgetCard.querySelector('[data-role="perf-budget-bars"]') : null;
            const budgetAlerts = budgetCard ? budgetCard.querySelector('[data-role="perf-budget-alerts"]') : null;
            const saveBudgetsBtn = budgetCard ? budgetCard.querySelector('[data-action="save-budgets"]') : null;
            const loadBudgetsBtn = budgetCard ? budgetCard.querySelector('[data-action="load-budgets"]') : null;
            const resetBudgetsBtn = budgetCard ? budgetCard.querySelector('[data-action="reset-budgets"]') : null;
            const perfMonitorCard = performanceSection.querySelector('[data-role="perf-monitor-card"]');
            const perfMonitorMeta = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-meta"]') : null;
            const perfMonitorRunBtn = perfMonitorCard ? perfMonitorCard.querySelector('[data-action="perf-monitor-run"]') : null;
            const perfMonitorExportBtn = perfMonitorCard ? perfMonitorCard.querySelector('[data-action="perf-monitor-export"]') : null;
            const perfMonitorUrl = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-url"]') : null;
            const perfMonitorFreq = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-frequency"]') : null;
            const perfMonitorProfile = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-profile"]') : null;
            const perfMonitorAddBtn = perfMonitorCard ? perfMonitorCard.querySelector('[data-action="perf-monitor-add"]') : null;
            const perfMonitorPluginInput = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-plugin"]') : null;
            const perfMonitorPluginCheck = perfMonitorCard ? perfMonitorCard.querySelector('[data-action="perf-monitor-plugin-check"]') : null;
            const perfMonitorSchedules = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-schedules"]') : null;
            const perfMonitorAlerts = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-alerts"]') : null;
            const perfMonitorLatest = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-latest"]') : null;
            const perfMonitorHistory = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-history"]') : null;
            const perfMonitorChart = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-chart"]') : null;
            const perfMonitorChartWrapper = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-chart-wrapper"]') : null;
            const perfMonitorWebhook = perfMonitorCard ? perfMonitorCard.querySelector('[data-role="perf-monitor-webhook"]') : null;
            const memoryCard = performanceSection.querySelector('[data-role="memory-profiler-card"]');
            const memoryStatus = memoryCard ? memoryCard.querySelector('[data-role="memory-status"]') : null;
            const memoryNote = memoryCard ? memoryCard.querySelector('[data-role="memory-note"]') : null;
            const memoryHeapUsed = memoryCard ? memoryCard.querySelector('[data-role="memory-heap-used"]') : null;
            const memoryHeapTotal = memoryCard ? memoryCard.querySelector('[data-role="memory-heap-total"]') : null;
            const memoryDomCount = memoryCard ? memoryCard.querySelector('[data-role="memory-dom-count"]') : null;
            const memoryListenerCount = memoryCard ? memoryCard.querySelector('[data-role="memory-listener-count"]') : null;
            const memoryGlobalCount = memoryCard ? memoryCard.querySelector('[data-role="memory-global-count"]') : null;
            const memoryChart = memoryCard ? memoryCard.querySelector('[data-role="memory-chart"]') : null;
            const memoryChartWrapper = memoryCard ? memoryCard.querySelector('[data-role="memory-chart-wrapper"]') : null;
            const memoryTable = memoryCard ? memoryCard.querySelector('[data-role="memory-suspect-table"]') : null;
            const memoryRecoList = memoryCard ? memoryCard.querySelector('[data-role="memory-recommendations"]') : null;
            const startMemoryBtn = memoryCard ? memoryCard.querySelector('[data-action="start-memory-profile"]') : null;
            const stopMemoryBtn = memoryCard ? memoryCard.querySelector('[data-action="stop-memory-profile"]') : null;
            const exportMemoryBtn = memoryCard ? memoryCard.querySelector('[data-action="export-memory-profile"]') : null;

            let collectedImages = [];
            let selectedImages = [];
            lcpEntry = null;
            let clsValue = 0;
            let firstInputDelay = null;
            let longTaskStats = { count: 0, total: 0 };
            let paintMetrics = { fp: null, fcp: null };
            let latestPerfSummary = {};
            const budgetFallbacks = state.budgets || {
                lcp_ms: 2500,
                fid_ms: 100,
                cls: 0.1,
                weight_kb: 1800,
                requests: 120,
            };
            let budgets = budgetFallbacks;
            let lastBudgetActuals = null;
            const budgetLogsSent = new Set();
            let optimizationQueue = [];
            let lastOptimizationResults = null;
            let a11yIssuesState = [];
            const formStoreKey = 'plugencyFormMetrics';
            const formVariantKey = 'plugencyFormVariant';
            let formMetrics = null;
            let formVariant = null;
            let updateWcPerf = null;
            let perfTests = snapshotData.perf_tests || {};
            let perfMonitorTimer = null;
            const perfProfiles = {
                desktop: { device: 'desktop', network: '4G', multiplier: 1 },
                mobile: { device: 'mobile', network: '3G', multiplier: 1.25 },
                slow: { device: 'budget', network: 'slow-3G', multiplier: 1.6 },
            };

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
                try {
                    const fidObserver = new PerformanceObserver((entryList) => {
                        const entries = entryList.getEntries();
                        if (entries && entries.length) {
                            const first = entries[0];
                            const delay = (first.processingStart || 0) - (first.startTime || 0);
                            firstInputDelay = Math.max(0, delay);
                        }
                    });
                    fidObserver.observe({ type: 'first-input', buffered: true });
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

            const sanitizeBudgets = (raw = {}) => {
                const base = { ...budgetFallbacks };
                Object.keys(base).forEach((key) => {
                    if (typeof raw[key] === 'undefined') {
                        return;
                    }
                    const val = raw[key];
                    if (key === 'cls') {
                        base[key] = Math.max(0, parseFloat(val) || 0);
                    } else {
                        base[key] = Math.max(0, parseInt(val, 10) || 0);
                    }
                });
                return base;
            };
            budgets = sanitizeBudgets(budgets);

            const budgetLabel = (key) => ({
                lcp_ms: 'Largest Contentful Paint',
                fid_ms: 'First Input Delay',
                cls: 'Cumulative Layout Shift',
                weight_kb: 'Total page weight',
                requests: 'Request count',
            }[key] || key);

            const formatBudgetValue = (key, val) => {
                if (val === null || typeof val === 'undefined') {
                    return 'n/a';
                }
                if (key === 'cls') {
                    return (parseFloat(val) || 0).toFixed(3);
                }
                if (key === 'weight_kb') {
                    return `${Math.round(val)} KB`;
                }
                if (key === 'requests') {
                    return `${Math.round(val)}`;
                }
                return formatMs(val);
            };

            const initWcPerf = () => {
                if (!wcCard) {
                    updateWcPerf = null;
                    return;
                }

                const setBadge = (text, tone = 'neutral') => {
                    if (!wcMeta) return;
                    wcMeta.textContent = text;
                    wcMeta.className = `plugency-badge ${tone}`;
                };

                const renderSimpleList = (target, items, empty) => {
                    if (!target) return;
                    target.innerHTML = '';
                    if (!items || !items.length) {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item';
                        const text = document.createElement('span');
                        text.className = 'plugency-source';
                        text.textContent = empty;
                        row.appendChild(text);
                        target.appendChild(row);
                        return;
                    }
                    items.forEach((item) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item plugency-perf-row';
                        const title = document.createElement('div');
                        title.className = 'plugency-path';
                        title.textContent = item.title || '';
                        row.appendChild(title);
                        if (item.desc) {
                            const desc = document.createElement('span');
                            desc.className = 'plugency-source';
                            desc.textContent = item.desc;
                            row.appendChild(desc);
                        }
                        const meta = document.createElement('div');
                        meta.className = 'plugency-accordion-meta';
                        meta.textContent = item.meta || '';
                        row.appendChild(meta);
                        if (item.tone) {
                            const pill = document.createElement('span');
                            pill.className = 'plugency-pill';
                            pill.classList.add(item.tone);
                            pill.textContent = item.label || item.tone;
                            row.appendChild(pill);
                        }
                        target.appendChild(row);
                    });
                };

                const sanitizeSql = (sql = '') => sql.replace(/\s+/g, ' ').trim();

                const hasWooCommerce = () => {
                    const plugins = Array.isArray(snapshotData?.context?.plugins) ? snapshotData.context.plugins : [];
                    return plugins.some((plugin) => {
                        const label = (plugin.name || plugin.source || plugin.plugin_file || '').toLowerCase();
                        return label.indexOf('woocommerce') !== -1;
                    });
                };

                const compute = (perfSummary = latestPerfSummary || {}) => {
                    const requestUrl = snapshotData?.summary?.request?.url || window.location.href || '';
                    const lowerUrl = (requestUrl || '').toLowerCase();
                    const cartView = lowerUrl.indexOf('cart') !== -1;
                    const checkoutView = lowerUrl.indexOf('checkout') !== -1;
                    const wcActive = hasWooCommerce();
                    const queries = Array.isArray(snapshotData.queries) ? snapshotData.queries : [];
                    const wcQueries = queries.filter((q) => /woocommerce|wc_|wp_wc|product|order|cart|checkout|variation/i.test(q.sql || ''));
                    const wcTimeMs = wcQueries.reduce((sum, q) => sum + ((q.time || 0) * 1000), 0);
                    const cartQueries = wcQueries.filter((q) => /cart|checkout|order|session/i.test(q.sql || ''));
                    const cartTimeMs = cartQueries.reduce((sum, q) => sum + ((q.time || 0) * 1000), 0);
                    const variationQueries = wcQueries.filter((q) => /variation/i.test(q.sql || ''));
                    const productLoops = wcQueries.filter((q) => /post_type\s*=\s*('|\")?(product|product_variation)/i.test(q.sql || ''));
                    const unboundedLoops = productLoops.filter((q) => !/limit\s+\d+/i.test(q.sql || ''));
                    const slowWcQueries = wcQueries
                        .filter((q) => (q.time || 0) > 0.05)
                        .sort((a, b) => (b.time || 0) - (a.time || 0))
                        .slice(0, 4);
                    const duplicates = Array.isArray(snapshotData.query_tables?.duplicates) ? snapshotData.query_tables.duplicates : [];
                    const wcDuplicates = duplicates
                        .filter((dup) => /wc_|woocommerce|product/i.test(dup.sql || ''))
                        .slice(0, 4);
                    const hookEvents = Array.isArray(snapshotData?.hooks?.events) ? snapshotData.hooks.events : [];
                    const slowHooks = hookEvents
                        .filter((h) => h && h.tag && /wc_|woocommerce/i.test(h.tag) && ((h.duration_ms || 0) > 30 || (h.duration || 0) > 0.03))
                        .sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0))
                        .slice(0, 5);
                    const transients = snapshotData.transients || {};
                    const transientItems = Array.isArray(transients.items) ? transients.items : [];
                    const wcTransients = transientItems.filter((t) => /wc_|woocommerce/i.test((t.name || '') + (t.source || '')));
                    const expiredWc = wcTransients.filter((t) => t.expired);
                    const orphanWc = wcTransients.filter((t) => t.orphan);
                    const hits = transients.queries && typeof transients.queries.hits !== 'undefined' ? transients.queries.hits : 0;
                    const writes = transients.queries && typeof transients.queries.writes !== 'undefined' ? transients.queries.writes : 0;
                    const heavyImages = (collectedImages || []).filter((img) => (img.transfer || 0) > 200000 || (img.renderedWidth || 0) > 1400);
                    const missingLazy = (collectedImages || []).filter((img) => {
                        const el = img.sample;
                        if (!el || typeof el.getBoundingClientRect !== 'function') {
                            return false;
                        }
                        const rect = el.getBoundingClientRect();
                        return rect.top > window.innerHeight * 1.1 && !el.loading;
                    });
                    const nav = perfSummary.navMetrics || {};
                    const lcpMs = perfSummary.lcp || null;
                    const totalTransfer = perfSummary.summary ? perfSummary.summary.totalTransfer : null;
                    const recos = [];

                    if (!wcActive) {
                        recos.push({ title: 'WooCommerce not detected', meta: 'Activate WooCommerce to unlock contextual signals.', tone: 'warn' });
                    }
                    if (unboundedLoops.length) {
                        recos.push({ title: 'Paginate product loops', meta: `${unboundedLoops.length} queries missing LIMIT. Add pagination or lazy loading.`, tone: 'warn' });
                    }
                    if (variationQueries.length > 3) {
                        recos.push({ title: 'Cache variation data', meta: `${variationQueries.length} variation lookups captured. Preload attributes or cache variation pricing.`, tone: 'warn' });
                    }
                    if (slowWcQueries.length) {
                        const slow = slowWcQueries[0];
                        recos.push({
                            title: 'Optimize slow WC queries',
                            meta: `${formatMs((slow.time || 0) * 1000)} slowest: ${sanitizeSql(slow.sql).slice(0, 80)}...`,
                            tone: 'error',
                        });
                    }
                    if (wcDuplicates.length) {
                        recos.push({ title: 'Resolve N+1 patterns', meta: `${wcDuplicates.length} duplicate WooCommerce query patterns detected.`, tone: 'warn' });
                    }
                    if (expiredWc.length || orphanWc.length) {
                        recos.push({
                            title: 'Clean WooCommerce transients',
                            meta: `${expiredWc.length} expired, ${orphanWc.length} orphan. Enable object cache + cleanup.`,
                            tone: 'warn',
                        });
                    }
                    if (slowHooks.length) {
                        recos.push({
                            title: 'Review slow Woo hooks',
                            meta: slowHooks.map((h) => `${h.tag} (${formatMs((h.duration_ms || (h.duration || 0) * 1000))})`).join(', '),
                            tone: 'warn',
                        });
                    }
                    if (heavyImages.length) {
                        recos.push({
                            title: 'Optimize product media',
                            meta: `${heavyImages.length} heavy product/gallery images. Add WebP/AVIF + responsive srcset.`,
                            tone: 'warn',
                        });
                    }
                    if (missingLazy.length) {
                        recos.push({
                            title: 'Lazy-load catalog images',
                            meta: `${missingLazy.length} below-the-fold images missing loading="lazy".`,
                            tone: 'warn',
                        });
                    }
                    if (!cartView && !checkoutView && (lowerUrl.indexOf('wc-ajax') !== -1 || lowerUrl.indexOf('wc_session') !== -1)) {
                        recos.push({
                            title: 'Avoid cart fragments globally',
                            meta: 'Disable cart fragments on non-cart pages to cut WC AJAX overhead.',
                            tone: 'warn',
                        });
                    }

                    const cartItems = [
                        { title: 'WooCommerce', meta: wcActive ? 'Active' : 'Not detected', tone: wcActive ? 'success' : 'warn', label: wcActive ? 'on' : 'off' },
                        { title: 'Page', meta: cartView ? 'Cart view' : (checkoutView ? 'Checkout view' : 'General view'), tone: cartView || checkoutView ? 'success' : 'neutral' },
                        { title: 'Load', meta: nav.load ? `${formatMs(nav.load)} load | TTFB ${formatMs(nav.ttfb)}` : 'n/a', tone: nav.load && nav.load > 4000 ? 'warn' : 'neutral', desc: totalTransfer ? `${formatBytes(totalTransfer)} transfer` : '' },
                        { title: 'LCP', meta: lcpMs ? formatMs(lcpMs) : 'n/a', tone: lcpMs && lcpMs > 3000 ? 'warn' : 'neutral' },
                        { title: 'Cart/checkout queries', meta: `${cartQueries.length} queries | ${formatMs(cartTimeMs)}`, tone: cartQueries.length > 12 || cartTimeMs > 250 ? 'warn' : 'neutral', desc: slowWcQueries[0] ? `Slowest ${formatMs((slowWcQueries[0].time || 0) * 1000)}` : '' },
                        { title: 'REST/AJAX', meta: lowerUrl.indexOf('wc-ajax') !== -1 || lowerUrl.indexOf('/wp-json/wc/') !== -1 ? 'Woo AJAX detected' : 'No WC REST detected', tone: lowerUrl.indexOf('wc-ajax') !== -1 ? 'warn' : 'neutral' },
                    ];

                    const queryItems = [
                        { title: 'Woo queries', meta: `${wcQueries.length}/${queries.length} | ${formatMs(wcTimeMs)}`, tone: wcQueries.length > 20 || wcTimeMs > 500 ? 'warn' : 'success' },
                        { title: 'Variation lookups', meta: `${variationQueries.length} queries`, tone: variationQueries.length > 3 ? 'warn' : 'neutral' },
                        { title: 'Product loops', meta: `${productLoops.length} loops | ${unboundedLoops.length} without LIMIT`, tone: unboundedLoops.length ? 'warn' : 'neutral' },
                        { title: 'Duplicates', meta: `${wcDuplicates.length} patterns`, tone: wcDuplicates.length ? 'warn' : 'success' },
                        { title: 'Slowest', meta: slowWcQueries[0] ? `${formatMs((slowWcQueries[0].time || 0) * 1000)} | ${sanitizeSql(slowWcQueries[0].sql).slice(0, 90)}...` : 'No slow WC queries captured', tone: slowWcQueries.length ? 'error' : 'success' },
                    ];

                    const dbItems = [
                        {
                            title: 'Indexes',
                            meta: 'wp_wc_order_stats(order_id,date_created_gmt,status), wp_postmeta(meta_key,post_id) for _price/_stock, wp_woocommerce_order_items(order_id,order_item_type)',
                            tone: 'warn',
                        },
                        {
                            title: 'Transients',
                            meta: `${wcTransients.length} WC transients | ${expiredWc.length} expired | ${orphanWc.length} orphan`,
                            desc: `Hits ${hits}, writes ${writes}`,
                            tone: expiredWc.length || orphanWc.length ? 'warn' : 'neutral',
                        },
                        {
                            title: 'Object cache',
                            meta: 'Use persistent cache for sessions, cart fragments, and transients.',
                            tone: 'warn',
                        },
                    ];

                    const recoItems = recos.map((rec) => ({
                        title: rec.title,
                        meta: rec.meta,
                        tone: rec.tone || 'neutral',
                        label: rec.label || rec.tone || 'note',
                    }));

                    const issueScore = recos.length + (slowWcQueries.length ? 1 : 0) + (unboundedLoops.length ? 1 : 0);
                    const tone = issueScore >= 5 ? 'error' : (issueScore >= 2 ? 'warn' : (wcActive ? 'success' : 'neutral'));
                    const badgeText = wcActive ? (issueScore ? `${issueScore} Woo issues` : 'WooCommerce healthy') : 'WooCommerce not detected';

                    const exportPayload = {
                        url: requestUrl,
                        page: { cart: cartView, checkout: checkoutView },
                        nav: { load_ms: nav.load || null, ttfb_ms: nav.ttfb || null, transfer_bytes: totalTransfer || null, lcp_ms: lcpMs },
                        queries: {
                            total: queries.length,
                            woo_total: wcQueries.length,
                            woo_time_ms: Math.round(wcTimeMs),
                            cart_total: cartQueries.length,
                            cart_time_ms: Math.round(cartTimeMs),
                            variation_total: variationQueries.length,
                            unbounded_loops: unboundedLoops.length,
                            duplicates: wcDuplicates.map((d) => ({ sql: sanitizeSql(d.sql || '').slice(0, 200), count: d.count || 0, time_ms: d.time ? Math.round((d.time || 0) * 1000) : null })),
                            slow: slowWcQueries.map((q) => ({ sql: sanitizeSql(q.sql || '').slice(0, 200), time_ms: Math.round((q.time || 0) * 1000), caller: q.caller || '' })),
                        },
                        transients: {
                            total: transients.counts ? transients.counts.total : 0,
                            woo: wcTransients.length,
                            expired: expiredWc.length,
                            orphan: orphanWc.length,
                            hits,
                            writes,
                        },
                        hooks: slowHooks.map((h) => ({
                            tag: h.tag,
                            duration_ms: h.duration_ms || (h.duration ? h.duration * 1000 : null),
                            memory_delta: h.memory_delta || 0,
                            ended_at: h.ended_at || null,
                        })),
                        images: {
                            heavy: heavyImages.slice(0, 6).map((img) => ({
                                src: img.src,
                                transfer: img.transfer || null,
                                rendered: { w: img.renderedWidth || 0, h: img.renderedHeight || 0 },
                            })),
                            missing_lazy: missingLazy.slice(0, 6).map((img) => ({
                                src: img.src,
                                rendered: { w: img.renderedWidth || 0, h: img.renderedHeight || 0 },
                            })),
                        },
                        recommendations: recos.map((r) => `${r.title}: ${r.meta}`),
                    };

                    return {
                        cartItems,
                        queryItems,
                        dbItems,
                        recoItems,
                        meta: { tone, text: badgeText },
                        exportPayload,
                    };
                };

                const refresh = (perfSummary) => {
                    const analysis = compute(perfSummary);
                    renderSimpleList(wcCartList, analysis.cartItems, 'No cart/checkout signals yet.');
                    renderSimpleList(wcQueryList, analysis.queryItems, 'No WooCommerce queries captured.');
                    renderSimpleList(wcDbList, analysis.dbItems, 'No DB/cache signals detected.');
                    renderSimpleList(wcRecos, analysis.recoItems, 'No recommendations yet.');
                    setBadge(analysis.meta.text, analysis.meta.tone);
                };

                updateWcPerf = (perfSummary) => refresh(perfSummary || latestPerfSummary);

                if (wcRefreshBtn) {
                    wcRefreshBtn.addEventListener('click', () => {
                        setLoading(wcRefreshBtn, true, 'Refreshing...');
                        refresh(latestPerfSummary);
                        setLoading(wcRefreshBtn, false);
                        setStatus('WooCommerce performance refreshed.', 'success');
                    });
                }

                if (wcExportBtn) {
                    wcExportBtn.addEventListener('click', () => {
                        const analysis = compute(latestPerfSummary);
                        const pretty = JSON.stringify(analysis.exportPayload, null, 2);
                        openActionModal({
                            title: 'WooCommerce performance export',
                            message: 'Copy metrics, queries, and recommendations.',
                            code: pretty,
                            copyLabel: 'Copy JSON',
                            hint: 'Includes cart/checkout, query, transient, and hook signals.',
                        });
                    });
                }

                refresh(latestPerfSummary);
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

            getResourceEntries = () => {
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

            summarizeThirdParty = (entries) => {
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

            const applyBudgetsToForm = (values) => {
                if (!budgetInputs || !budgetInputs.length) {
                    return;
                }
                budgetInputs.forEach((input) => {
                    const key = input.getAttribute('data-budget-key');
                    if (!key) {
                        return;
                    }
                    input.value = typeof values[key] !== 'undefined' ? values[key] : '';
                });
            };

            const readBudgetsFromForm = () => {
                const raw = {};
                budgetInputs.forEach((input) => {
                    const key = input.getAttribute('data-budget-key');
                    if (!key) {
                        return;
                    }
                    const val = input.value;
                    if (key === 'cls') {
                        raw[key] = parseFloat(val || '0');
                    } else {
                        raw[key] = parseInt(val || '0', 10);
                    }
                });
                return sanitizeBudgets(raw);
            };

            const updateBudgetStatus = (text, tone = 'neutral') => {
                if (!budgetStatus) {
                    return;
                }
                budgetStatus.textContent = text;
                budgetStatus.classList.remove('success', 'warn', 'neutral');
                budgetStatus.classList.add(tone);
            };

            const renderBudgetBars = (items) => {
                if (!budgetBars) {
                    return;
                }
                budgetBars.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No budgets evaluated yet.';
                    row.appendChild(text);
                    budgetBars.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-budget-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = `${budgetLabel(item.key)}`;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${formatBudgetValue(item.key, item.actual)} / ${formatBudgetValue(item.key, item.budget)}`;
                    const barWrap = document.createElement('div');
                    barWrap.className = 'plugency-budget-bar';
                    const bar = document.createElement('div');
                    bar.className = `plugency-budget-bar-fill ${item.status}`;
                    const ratio = item.budget > 0 && item.actual !== null ? Math.min(100, Math.round((item.actual / item.budget) * 100)) : 0;
                    bar.style.width = `${ratio}%`;
                    bar.textContent = item.budget > 0 && item.actual !== null ? `${ratio}%` : 'n/a';
                    barWrap.appendChild(bar);
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.appendChild(barWrap);
                    budgetBars.appendChild(row);
                });
            };

            const renderBudgetAlerts = (items, recommendations) => {
                if (!budgetAlerts) {
                    return;
                }
                budgetAlerts.innerHTML = '';
                const combined = [...(items || []), ...(recommendations || [])];
                if (!combined.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'All budgets are within limits.';
                    row.appendChild(text);
                    budgetAlerts.appendChild(row);
                    return;
                }
                combined.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.label;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = item.meta || '';
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    if (item.tone === 'error') {
                        pill.classList.add('error');
                        pill.textContent = 'Over';
                    } else if (item.tone === 'warn') {
                        pill.classList.add('warn');
                        pill.textContent = 'Near';
                    } else {
                        pill.classList.add('success');
                        pill.textContent = 'Ok';
                    }
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.appendChild(pill);
                    budgetAlerts.appendChild(row);
                });
            };

            const buildRecommendations = (overages) => {
                const recs = [];
                overages.forEach((item) => {
                    if (item.key === 'lcp_ms') {
                        recs.push({ label: 'LCP is high: inline critical CSS and optimise hero media.', meta: '', tone: 'error' });
                    } else if (item.key === 'fid_ms') {
                        recs.push({ label: 'FID is high: reduce main-thread work and defer non-critical JS.', meta: '', tone: 'warn' });
                    } else if (item.key === 'cls') {
                        recs.push({ label: 'CLS over budget: add dimensions to images/fonts and avoid late layout shifts.', meta: '', tone: 'warn' });
                    } else if (item.key === 'weight_kb') {
                        recs.push({ label: 'Page weight heavy: trim unused CSS/JS and compress media.', meta: '', tone: 'error' });
                    } else if (item.key === 'requests') {
                        recs.push({ label: 'Too many requests: combine or defer non-critical assets.', meta: '', tone: 'warn' });
                    }
                });
                return recs;
            };

            const evaluateBudgets = (actuals) => {
                if (!budgetCard || !actuals) {
                    return;
                }
                lastBudgetActuals = actuals;
                const results = [];
                const alerts = [];
                Object.keys(budgets).forEach((key) => {
                    const budgetVal = budgets[key];
                    const actualVal = typeof actuals[key] === 'number' && !Number.isNaN(actuals[key]) ? actuals[key] : null;
                    const skip = !budgetVal || budgetVal <= 0 || actualVal === null;
                    if (skip) {
                        return;
                    }
                    const ratio = budgetVal > 0 ? actualVal / budgetVal : 0;
                    let status = 'success';
                    let tone = 'success';
                    if (ratio > 1.1) {
                        status = 'error';
                        tone = 'error';
                    } else if (ratio > 1.0) {
                        status = 'warn';
                        tone = 'warn';
                    }
                    results.push({
                        key,
                        budget: budgetVal,
                        actual: actualVal,
                        status,
                    });
                    if (status !== 'success') {
                        alerts.push({
                            key,
                            label: `${budgetLabel(key)} over budget`,
                            meta: `${formatBudgetValue(key, actualVal)} vs ${formatBudgetValue(key, budgetVal)}`,
                            tone,
                        });
                        if (status === 'error' && !budgetLogsSent.has(key)) {
                            budgetLogsSent.add(key);
                            post('plugency_log_budget_violation', {
                                metric: key,
                                actual: actualVal,
                                budget: budgetVal,
                            }).catch(() => {});
                        }
                    }
                });
                renderBudgetBars(results);
                const recommendations = buildRecommendations(alerts);
                renderBudgetAlerts(alerts, recommendations);
                if (alerts.length === 0) {
                    updateBudgetStatus('Healthy', 'success');
                    if (budgetNote) {
                        budgetNote.textContent = 'Budgets are within thresholds.';
                    }
                } else {
                    const worstTone = alerts.find((a) => a.tone === 'error') ? 'error' : 'warn';
                    updateBudgetStatus(`${alerts.length} over budget`, worstTone === 'error' ? 'warn' : 'warn');
                    if (budgetNote) {
                        budgetNote.textContent = 'Budgets exceeded. Review alerts and recommendations.';
                    }
                }
            };

            const defaultFormMetrics = () => ({
                sessions: 0,
                started: 0,
                submitted: 0,
                success: 0,
                failure: 0,
                spam: 0,
                fields: {},
                submissions: [],
                load_ms: performance && performance.timing ? (performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart) : Math.round(performance.now()),
            });

            const loadFormMetrics = () => {
                try {
                    const raw = JSON.parse(localStorage.getItem(formStoreKey) || '{}');
                    return { ...defaultFormMetrics(), ...raw };
                } catch (e) {
                    return defaultFormMetrics();
                }
            };

            const saveFormMetrics = (data) => {
                try {
                    localStorage.setItem(formStoreKey, JSON.stringify(data));
                } catch (e) {
                    /* ignore */
                }
            };

            const loadFormVariant = () => {
                try {
                    return localStorage.getItem(formVariantKey) || null;
                } catch (e) {
                    return null;
                }
            };

            const setFormVariant = (variant) => {
                formVariant = variant;
                try {
                    if (variant === null) {
                        localStorage.removeItem(formVariantKey);
                    } else {
                        localStorage.setItem(formVariantKey, variant);
                    }
                } catch (e) {
                    /* ignore */
                }
                if (formVariantBadge) {
                    formVariantBadge.textContent = `Variant: ${variant || '-'}`;
                }
            };

            const updateFormMeta = (abandonRate, successRate, spamCount) => {
                if (formMeta) {
                    formMeta.textContent = `Abandon ${abandonRate.toFixed(1)}% | Success ${successRate.toFixed(1)}%`;
                    formMeta.classList.remove('neutral', 'warn', 'success');
                    formMeta.classList.add(successRate >= 80 ? 'success' : 'warn');
                }
                if (formAbandon) formAbandon.textContent = `${abandonRate.toFixed(1)}%`;
                if (formSuccess) formSuccess.textContent = `${successRate.toFixed(1)}%`;
                if (formSpam) formSpam.textContent = `${spamCount}`;
            };

            const renderFormHeatmap = () => {
                if (!formHeatmap || !formMetrics) return;
                formHeatmap.innerHTML = '';
                const fields = Object.entries(formMetrics.fields || {}).map(([name, data]) => ({
                    name,
                    dwell: data.dwell || 0,
                    errors: data.errors || 0,
                    focus: data.focus || 0,
                    required: data.required || false,
                }));
                fields.sort((a, b) => (b.dwell || 0) - (a.dwell || 0));
                const top = fields.slice(0, 8);
                if (!top.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'Waiting for form interactions...';
                    row.appendChild(text);
                    formHeatmap.appendChild(row);
                    return;
                }
                top.forEach((field) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = field.name;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${Math.round(field.dwell)} ms | ${field.errors} errors`;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill';
                    if (field.errors > 3) {
                        pill.classList.add('warn');
                        pill.textContent = 'Error-prone';
                    } else if (field.dwell > 2000) {
                        pill.classList.add('neutral');
                        pill.textContent = 'Slow';
                    } else {
                        pill.classList.add('success');
                        pill.textContent = 'OK';
                    }
                    row.appendChild(label);
                    row.appendChild(meta);
                    row.appendChild(pill);
                    formHeatmap.appendChild(row);
                });
            };

            const drawBars = (canvas, labels, values, color = '#22c55e') => {
                if (!canvas || !canvas.getContext) return;
                const ctx = canvas.getContext('2d');
                const width = canvas.width;
                const height = canvas.height;
                ctx.clearRect(0, 0, width, height);
                if (!labels.length) {
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText('No data yet.', 8, 16);
                    return;
                }
                const max = Math.max(...values, 1);
                const barWidth = Math.max(10, Math.floor((width - 20) / labels.length));
                labels.forEach((label, idx) => {
                    const val = values[idx];
                    const h = Math.round((val / max) * (height - 30));
                    const x = 10 + idx * barWidth;
                    ctx.fillStyle = color;
                    ctx.fillRect(x, height - h - 20, barWidth - 4, h);
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText(label.slice(0, 10), x, height - 6);
                });
            };

            const renderFormFunnel = () => {
                if (!formMetrics || !formFunnel) return;
                const values = [
                    formMetrics.sessions || 0,
                    formMetrics.started || 0,
                    formMetrics.submitted || 0,
                    formMetrics.success || 0,
                ];
                const labels = ['Visits', 'Started', 'Submitted', 'Success'];
                drawBars(formFunnel, labels, values, '#3b82f6');
            };

            const renderValidationChart = () => {
                if (!formMetrics || !formValidationCanvas) return;
                const errors = Object.entries(formMetrics.fields || {}).map(([name, data]) => ({
                    name,
                    errors: data.errors || 0,
                })).filter((i) => i.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 8);
                drawBars(formValidationCanvas, errors.map((e) => e.name), errors.map((e) => e.errors), '#f97316');
            };

            const renderFormRecos = () => {
                if (!formRecos || !formMetrics) return;
                formRecos.innerHTML = '';
                const recs = [];
                Object.entries(formMetrics.fields || {}).forEach(([name, data]) => {
                    if ((data.errors || 0) > 3) {
                        recs.push(`Reduce friction on "${name}" (frequent validation errors). Add clearer hints/autocomplete.`);
                    }
                    if ((data.dwell || 0) > 3000) {
                        recs.push(`Users spend long on "${name}". Consider simplifying or adding helper text.`);
                    }
                    if (data.required && (data.fills || 0) < (data.focus || 0) * 0.5) {
                        recs.push(`"${name}" is required but often left empty. Re-evaluate necessity or make optional.`);
                    }
                    if (data.autocomplete === false) {
                        recs.push(`Add autocomplete to "${name}" to speed entry.`);
                    }
                    if (data.label === false) {
                        recs.push(`"${name}" missing label/aria-label. Add accessible label.`);
                    }
                });
                if ((formMetrics.spam || 0) > 0) {
                    recs.push('Spam patterns detected. Add honeypot, delay validation, or CAPTCHA for high-risk forms.');
                }
                if (!recs.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No UX issues detected yet.';
                    row.appendChild(text);
                    formRecos.appendChild(row);
                    return;
                }
                recs.slice(0, 8).forEach((rec) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = rec;
                    row.appendChild(label);
                    formRecos.appendChild(row);
                });
            };

            const renderFormStats = () => {
                if (!formMetrics) return;
                const abandonRate = formMetrics.started > 0 ? ((formMetrics.started - formMetrics.submitted) / formMetrics.started) * 100 : 0;
                const successRate = formMetrics.submitted > 0 ? (formMetrics.success / formMetrics.submitted) * 100 : 0;
                updateFormMeta(abandonRate, successRate, formMetrics.spam || 0);
                if (formLoad) {
                    formLoad.textContent = `${formMetrics.load_ms || 0} ms`;
                }
                renderFormHeatmap();
                renderFormFunnel();
                renderValidationChart();
                renderFormRecos();
            };

            const trackForm = (form) => {
                if (!form || form.dataset.plugencyFormBound === '1') return;
                form.dataset.plugencyFormBound = '1';
                formMetrics.sessions += 1;
                const startedAt = performance.now();
                const tagFormStarted = () => {
                    if (form.dataset.plugencyStarted === '1') return;
                    form.dataset.plugencyStarted = '1';
                    formMetrics.started += 1;
                };
                form.addEventListener('focusin', (e) => {
                    tagFormStarted();
                    const target = e.target;
                    if (!target || !target.name) return;
                    const key = target.name || target.id || target.placeholder || 'field';
                    const record = formMetrics.fields[key] || {};
                    record.focus = (record.focus || 0) + 1;
                    record.required = target.required || record.required || false;
                    record.autocomplete = target.hasAttribute('autocomplete') ? target.getAttribute('autocomplete') !== 'off' : record.autocomplete || false;
                    record.label = !!document.querySelector(`label[for="${target.id}"]`) || !!target.getAttribute('aria-label') || !!target.getAttribute('aria-labelledby');
                    record._start = performance.now();
                    formMetrics.fields[key] = record;
                }, true);
                form.addEventListener('focusout', (e) => {
                    const target = e.target;
                    if (!target || !target.name) return;
                    const key = target.name || target.id || target.placeholder || 'field';
                    const record = formMetrics.fields[key] || {};
                    const now = performance.now();
                    const start = record._start || now;
                    record.dwell = (record.dwell || 0) + Math.max(0, now - start);
                    if (target.value && target.value.trim() !== '') {
                        record.fills = (record.fills || 0) + 1;
                    }
                    record._start = 0;
                    formMetrics.fields[key] = record;
                    saveFormMetrics(formMetrics);
                }, true);
                form.addEventListener('invalid', (e) => {
                    const target = e.target;
                    if (!target || !target.name) return;
                    const key = target.name || target.id || target.placeholder || 'field';
                    const record = formMetrics.fields[key] || {};
                    record.errors = (record.errors || 0) + 1;
                    formMetrics.fields[key] = record;
                    formMetrics.failure += 1;
                    saveFormMetrics(formMetrics);
                }, true);
                form.addEventListener('submit', (e) => {
                    tagFormStarted();
                    formMetrics.submitted += 1;
                    if (formVariant) {
                        formMetrics.variant = formVariant;
                    }
                    if (e.defaultPrevented) {
                        formMetrics.failure += 1;
                    } else {
                        formMetrics.success += 1;
                    }
                    const elapsed = performance.now() - startedAt;
                    if (elapsed < 1500) {
                        formMetrics.spam += 1;
                    }
                    formMetrics.submissions.unshift({ time: new Date().toISOString(), duration: Math.round(elapsed) });
                    formMetrics.submissions = formMetrics.submissions.slice(0, 30);
                    saveFormMetrics(formMetrics);
                    setTimeout(renderFormStats, 10);
                });
            };

            const initFormUx = () => {
                if (!formCard) return;
                formMetrics = loadFormMetrics();
                formVariant = loadFormVariant();
                if (formVariantBadge) {
                    formVariantBadge.textContent = `Variant: ${formVariant || '-'}`;
                }
                Array.from(document.forms || []).forEach(trackForm);
                renderFormStats();
                if (formAssignBtn) {
                    formAssignBtn.addEventListener('click', () => {
                        const variant = Math.random() > 0.5 ? 'B' : 'A';
                        setFormVariant(variant);
                    });
                }
                if (formResetBtn) {
                    formResetBtn.addEventListener('click', () => setFormVariant(null));
                }
                if (formExportBtn) {
                    formExportBtn.addEventListener('click', () => {
                        renderFormStats();
                        openActionModal({
                            title: 'Form analytics export',
                            message: 'Copy JSON for external analysis.',
                            code: JSON.stringify(formMetrics, null, 2),
                            copyLabel: 'Copy form metrics',
                        });
                    });
                }
            };

            const loadBudgets = () => {
                if (!loadBudgetsBtn) {
                    return Promise.resolve();
                }
                setLoading(loadBudgetsBtn, true, 'Loading...');
                return post('plugency_get_budgets', {})
                    .then((data) => {
                        budgets = sanitizeBudgets(data || {});
                        applyBudgetsToForm(budgets);
                        evaluateBudgets(lastBudgetActuals);
                        setStatus('Budgets reloaded.', 'success');
                    })
                    .catch((error) => setStatus(error.message, 'error'))
                    .finally(() => setLoading(loadBudgetsBtn, false));
            };

            const saveBudgets = () => {
                budgets = readBudgetsFromForm();
                if (saveBudgetsBtn) {
                    setLoading(saveBudgetsBtn, true, 'Saving...');
                }
                return post('plugency_save_budgets', { budgets: JSON.stringify(budgets) })
                    .then((data) => {
                        budgets = sanitizeBudgets(data || budgets);
                        applyBudgetsToForm(budgets);
                        evaluateBudgets(lastBudgetActuals);
                        setStatus('Performance budgets saved.', 'success');
                    })
                    .catch((error) => setStatus(error.message, 'error'))
                    .finally(() => {
                        if (saveBudgetsBtn) {
                            setLoading(saveBudgetsBtn, false);
                        }
                    });
            };

            const resetBudgets = () => {
                budgets = sanitizeBudgets(budgetFallbacks);
                applyBudgetsToForm(budgets);
                evaluateBudgets(lastBudgetActuals);
                setStatus('Budgets reset to defaults.', 'info');
            };

            applyBudgetsToForm(budgets);

            const memoryState = {
                running: false,
                samples: [],
                interval: null,
                observer: null,
                added: 0,
                removed: 0,
                detachRecords: [],
                listenerCount: 0,
                listenerMap: new WeakMap(),
                listenerTypes: new Map(),
                patchedListeners: false,
                baselineGlobals: Object.keys(window).length,
                lastExport: null,
            };

            const setMemoryStatus = (text, tone = 'neutral') => {
                if (!memoryStatus) {
                    return;
                }
                memoryStatus.textContent = text;
                memoryStatus.classList.remove('success', 'warn', 'neutral', 'error');
                memoryStatus.classList.add(tone);
            };

            const describeNode = (node) => {
                if (!node || node.nodeType !== 1) {
                    return null;
                }
                const tag = (node.tagName || '').toLowerCase();
                const id = node.id ? `#${node.id}` : '';
                const cls = node.className && typeof node.className === 'string' ? `.${node.className.trim().replace(/\s+/g, '.')}` : '';
                const size = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0 };
                return {
                    label: `${tag}${id}${cls}` || '(element)',
                    size: `${Math.round(size.width)}x${Math.round(size.height)}`,
                    fingerprint: `${tag}${id}${cls}`,
                };
            };

            const recordDetached = (node) => {
                const desc = describeNode(node);
                if (!desc) {
                    return;
                }
                const existing = memoryState.detachRecords.find((r) => r.fingerprint === desc.fingerprint);
                if (existing) {
                    existing.count += 1;
                    existing.lastSeen = Date.now();
                } else {
                    memoryState.detachRecords.unshift({
                        ...desc,
                        count: 1,
                        firstSeen: Date.now(),
                        lastSeen: Date.now(),
                    });
                    memoryState.detachRecords = memoryState.detachRecords.slice(0, 40);
                }
            };

            const markIfDetached = (node) => {
                if (!node || node.nodeType !== 1) {
                    return;
                }
                setTimeout(() => {
                    if (!node.isConnected) {
                        recordDetached(node);
                    }
                }, 600);
            };

            const ensureListenerPatch = () => {
                if (memoryState.patchedListeners || !memoryCard || typeof EventTarget === 'undefined') {
                    return;
                }
                const origAdd = EventTarget.prototype.addEventListener;
                const origRemove = EventTarget.prototype.removeEventListener;
                EventTarget.prototype.addEventListener = function patched(type, listener, options) {
                    const result = origAdd.apply(this, [type, listener, options]);
                    memoryState.listenerCount += 1;
                    const key = this && this.nodeType ? describeNode(this)?.fingerprint || '(node)' : (this && this.constructor ? this.constructor.name : 'object');
                    const entry = memoryState.listenerTypes.get(key) || { key, count: 0, type: type || 'event' };
                    entry.count += 1;
                    memoryState.listenerTypes.set(key, entry);
                    const current = memoryState.listenerMap.get(this) || 0;
                    memoryState.listenerMap.set(this, current + 1);
                    return result;
                };
                EventTarget.prototype.removeEventListener = function patchedRemove(type, listener, options) {
                    const result = origRemove.apply(this, [type, listener, options]);
                    const current = memoryState.listenerMap.get(this) || 0;
                    if (current > 0) {
                        memoryState.listenerMap.set(this, current - 1);
                        memoryState.listenerCount = Math.max(0, memoryState.listenerCount - 1);
                    }
                    return result;
                };
                memoryState.patchedListeners = true;
            };

            const connectDomObserver = () => {
                if (!memoryCard || typeof MutationObserver === 'undefined') {
                    return;
                }
                if (memoryState.observer) {
                    memoryState.observer.disconnect();
                }
                memoryState.observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.addedNodes && mutation.addedNodes.length) {
                            memoryState.added += mutation.addedNodes.length;
                        }
                        if (mutation.removedNodes && mutation.removedNodes.length) {
                            memoryState.removed += mutation.removedNodes.length;
                            mutation.removedNodes.forEach((node) => markIfDetached(node));
                        }
                    });
                });
                memoryState.observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
            };

            const renderMemoryTable = (items) => {
                if (!memoryTable) {
                    return;
                }
                const tbody = memoryTable.querySelector('tbody');
                if (!tbody) {
                    return;
                }
                tbody.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('tr');
                    const cell = document.createElement('td');
                    cell.colSpan = 4;
                    cell.textContent = 'No suspicious retention detected yet.';
                    row.appendChild(cell);
                    tbody.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('tr');
                    const type = document.createElement('td');
                    type.textContent = item.type;
                    const details = document.createElement('td');
                    details.textContent = item.details;
                    const seen = document.createElement('td');
                    seen.textContent = item.seen;
                    const retention = document.createElement('td');
                    retention.textContent = item.retention;
                    row.appendChild(type);
                    row.appendChild(details);
                    row.appendChild(seen);
                    row.appendChild(retention);
                    tbody.appendChild(row);
                });
            };

            const renderMemoryRecommendations = (items) => {
                if (!memoryRecoList) {
                    return;
                }
                memoryRecoList.innerHTML = '';
                if (!items || !items.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No recommendations yet.';
                    row.appendChild(text);
                    memoryRecoList.appendChild(row);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = item;
                    row.appendChild(text);
                    memoryRecoList.appendChild(row);
                });
            };

            const renderMemoryChart = () => {
                if (!memoryChart || !memoryChart.getContext) {
                    return;
                }
                const ctx = memoryChart.getContext('2d');
                const width = memoryChart.width;
                const height = memoryChart.height;
                ctx.clearRect(0, 0, width, height);
                if (!memoryState.samples.length) {
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText('Awaiting samples...', 10, 20);
                    return;
                }
                const points = memoryState.samples.slice(-80);
                const maxVal = Math.max(...points.map((p) => p.usedMb || 0), 1);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2;
                ctx.beginPath();
                points.forEach((p, idx) => {
                    const x = (idx / Math.max(1, points.length - 1)) * (width - 10) + 5;
                    const y = height - ((p.usedMb || 0) / maxVal) * (height - 20) - 5;
                    if (idx === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(`Peak: ${formatBytes((maxVal || 0) * 1024 * 1024)}`, 8, height - 8);
            };

            const buildMemorySuspects = () => {
                const suspects = [];
                const globals = Object.keys(window).length;
                const globalDelta = globals - memoryState.baselineGlobals;
                if (globalDelta > 10) {
                    suspects.push({
                        type: 'Globals',
                        details: `Global variables grew by ${globalDelta}`,
                        seen: 'runtime',
                        retention: 'Check window.* assignments',
                    });
                }
                memoryState.detachRecords.slice(0, 8).forEach((rec) => {
                    suspects.push({
                        type: 'Detached DOM',
                        details: `${rec.label} (${rec.size})`,
                        seen: new Date(rec.lastSeen).toLocaleTimeString(),
                        retention: `${rec.count}x detached`,
                    });
                });
                const hotListeners = Array.from(memoryState.listenerTypes.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);
                if (hotListeners.length && hotListeners[0].count > 50) {
                    hotListeners.forEach((entry) => {
                        suspects.push({
                            type: 'Listeners',
                            details: `${entry.key || 'target'} (${entry.type})`,
                            seen: 'runtime',
                            retention: `${entry.count} listeners`,
                        });
                    });
                }
                if (memoryState.samples.length > 12) {
                    const last = memoryState.samples.slice(-8).filter((p) => typeof p.usedMb === 'number');
                    if (last.length) {
                        const first = last[0].usedMb || 0;
                        const end = last[last.length - 1].usedMb || 0;
                        if (end > first * 1.15 && end - first > 10) {
                            suspects.push({
                                type: 'Heap growth',
                                details: `Heap grew ${Math.round(end - first)} MB over last samples`,
                                seen: 'recent',
                                retention: 'Potential leak',
                            });
                        }
                    }
                }
                return suspects;
            };

            const renderMemoryStats = (sample) => {
                if (memoryHeapUsed) {
                    memoryHeapUsed.textContent = sample && sample.usedMb ? `${sample.usedMb.toFixed(1)} MB` : 'n/a';
                }
                if (memoryHeapTotal) {
                    memoryHeapTotal.textContent = sample && sample.totalMb ? `${sample.totalMb.toFixed(1)} MB` : 'n/a';
                }
                if (memoryDomCount) {
                    memoryDomCount.textContent = sample && sample.domCount !== null ? `${sample.domCount}` : 'n/a';
                }
                if (memoryListenerCount) {
                    memoryListenerCount.textContent = memoryState.listenerCount.toString();
                }
                if (memoryGlobalCount) {
                    memoryGlobalCount.textContent = sample && sample.globals !== null ? `${sample.globals}` : 'n/a';
                }
            };

            const buildMemoryRecommendations = (suspects) => {
                const recs = [];
                suspects.forEach((item) => {
                    if (item.type === 'Detached DOM') {
                        recs.push('Detached nodes detected. Ensure you remove event listeners and references when removing elements.');
                    }
                    if (item.type === 'Globals') {
                        recs.push('Global variable growth detected. Avoid assigning large objects to window; clean up singletons.');
                    }
                    if (item.type === 'Listeners') {
                        recs.push('High listener counts. Debounce listener creation and call removeEventListener during cleanup.');
                    }
                    if (item.type === 'Heap growth') {
                        recs.push('Heap is trending up. Look for timers/promises retaining data; use WeakMap/WeakRef where possible.');
                    }
                });
                if (snapshotData && snapshotData.hooks && snapshotData.hooks.insights && snapshotData.hooks.insights.total > 0) {
                    recs.push('Correlate leaks with slow hooks from the Hooks tab to find long-lived callbacks.');
                }
                return Array.from(new Set(recs)).slice(0, 8);
            };

            const sampleMemory = () => {
                const mem = performance.memory || null;
                const usedMb = mem && mem.usedJSHeapSize ? mem.usedJSHeapSize / (1024 * 1024) : null;
                const totalMb = mem && mem.totalJSHeapSize ? mem.totalJSHeapSize / (1024 * 1024) : null;
                const domCount = document.getElementsByTagName('*').length;
                const globals = Object.keys(window).length;
                const sample = {
                    t: performance.now(),
                    usedMb,
                    totalMb,
                    domCount,
                    listeners: memoryState.listenerCount,
                    globals,
                };
                memoryState.samples.push(sample);
                if (memoryState.samples.length > 180) {
                    memoryState.samples.shift();
                }
                memoryState.lastExport = {
                    samples: memoryState.samples.slice(-140),
                    detach: memoryState.detachRecords.slice(0, 20),
                    listeners: Array.from(memoryState.listenerTypes.entries()).slice(0, 12),
                    globals: globals - memoryState.baselineGlobals,
                };
                renderMemoryStats(sample);
                renderMemoryChart();
                const suspects = buildMemorySuspects();
                renderMemoryTable(suspects);
                renderMemoryRecommendations(buildMemoryRecommendations(suspects));
            };

            const stopMemoryProfiler = () => {
                memoryState.running = false;
                if (memoryState.interval) {
                    clearInterval(memoryState.interval);
                    memoryState.interval = null;
                }
                if (memoryState.observer) {
                    memoryState.observer.disconnect();
                }
                setMemoryStatus('Stopped', 'neutral');
                if (startMemoryBtn) startMemoryBtn.disabled = false;
                if (stopMemoryBtn) stopMemoryBtn.disabled = true;
                if (exportMemoryBtn) exportMemoryBtn.disabled = memoryState.samples.length === 0;
            };

            const startMemoryProfiler = () => {
                if (!memoryCard) {
                    return;
                }
                ensureListenerPatch();
                memoryState.running = true;
                memoryState.samples = [];
                memoryState.detachRecords = [];
                memoryState.listenerTypes.clear();
                memoryState.listenerCount = 0;
                memoryState.added = 0;
                memoryState.removed = 0;
                memoryState.baselineGlobals = Object.keys(window).length;
                connectDomObserver();
                sampleMemory();
                if (memoryState.interval) {
                    clearInterval(memoryState.interval);
                }
                memoryState.interval = setInterval(sampleMemory, 1500);
                setMemoryStatus('Running', 'success');
                if (startMemoryBtn) startMemoryBtn.disabled = true;
                if (stopMemoryBtn) stopMemoryBtn.disabled = false;
                if (exportMemoryBtn) exportMemoryBtn.disabled = true;
                if (memoryNote && !performance.memory) {
                    memoryNote.textContent = 'performance.memory not available; showing DOM/listener/global signals only.';
                }
            };

            const exportMemoryProfile = () => {
                if (!memoryCard) {
                    return;
                }
                if (!memoryState.lastExport || !memoryState.samples.length) {
                    setStatus('Start profiling to capture a memory snapshot.', 'error');
                    return;
                }
                const payload = {
                    captured_at: new Date().toISOString(),
                    url: window.location.href,
                    samples: memoryState.lastExport.samples,
                    detach: memoryState.lastExport.detach,
                    listeners: memoryState.lastExport.listeners,
                    globals_delta: memoryState.lastExport.globals,
                    hooks: snapshotData && snapshotData.hooks ? snapshotData.hooks : null,
                };
                const pretty = JSON.stringify(payload, null, 2);
                openActionModal({
                    title: 'Memory snapshot exported',
                    message: 'Copy this JSON for external analysis (DevTools/Node heap inspector).',
                    code: pretty,
                    copyLabel: 'Copy memory snapshot',
                    hint: 'Includes heap trend, detached nodes, listeners, globals, and hook context.',
                });
                if (exportMemoryBtn) {
                    exportMemoryBtn.disabled = false;
                }
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

            const highlightElement = (el) => {
                if (!el) return;
                el.classList.add('plugency-highlight');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => el.classList.remove('plugency-highlight'), 2200);
            };

            const luminance = (rgb) => {
                const [r, g, b] = rgb.map((v) => {
                    const c = v / 255;
                    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };

            const parseRgb = (color) => {
                if (!color) return [0, 0, 0];
                const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                if (!m) return [0, 0, 0];
                return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
            };

            const contrastRatio = (fg, bg) => {
                const L1 = luminance(parseRgb(fg)) + 0.05;
                const L2 = luminance(parseRgb(bg)) + 0.05;
                return L1 > L2 ? L1 / L2 : L2 / L1;
            };

            const getBgColor = (el) => {
                let node = el;
                while (node && node !== document.body) {
                    const style = getComputedStyle(node);
                    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
                        return style.backgroundColor;
                    }
                    node = node.parentElement;
                }
                return getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
            };

            const classifySeverity = (type) => {
                if (['contrast', 'aria', 'alt', 'keyboard'].includes(type)) return 'critical';
                if (['heading', 'form', 'focus'].includes(type)) return 'serious';
                return 'moderate';
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

            analyzeBundles = (entries) => {
                const scripts = (entries || []).filter((e) => (e.initiatorType || '').toLowerCase() === 'script');
                const bundles = scripts.map((e) => {
                    const size = e.transferSize || e.decodedBodySize || e.encodedBodySize || 0;
                    const name = normalizeKey(e.name || '').split('/').slice(-1)[0] || e.name || '(script)';
                    const base = name.split('?')[0];
                    return {
                        id: normalizeKey(e.name || ''),
                        name,
                        base,
                        size,
                        duration: e.duration || 0,
                        start: e.startTime || 0,
                        blocking: (e.startTime || 0) < (performance.timing?.domContentLoadedEventEnd || 1500) && size > 120000,
                    };
                });
                const totalSize = bundles.reduce((sum, b) => sum + b.size, 0);
                const duplicates = [];
                const byBase = new Map();
                bundles.forEach((b) => {
                    const key = b.base;
                    if (!byBase.has(key)) byBase.set(key, []);
                    byBase.get(key).push(b);
                });
                byBase.forEach((items, key) => {
                    if (items.length > 1) {
                        duplicates.push({ key, count: items.length, size: items.reduce((s, i) => s + i.size, 0) });
                    }
                });
                const coverage = bundles.map((b) => {
                    const unusedPct = b.size > 400000 ? 0.35 : (b.size > 200000 ? 0.2 : 0.1);
                    return { name: b.name, unused: Math.round(unusedPct * 100), size: b.size };
                });
                const deps = bundles.map((b, idx) => ({
                    from: b.name,
                    to: bundles[idx + 1] ? bundles[idx + 1].name : null,
                })).filter((d) => d.to);
                return { bundles, totalSize, duplicates, coverage, deps };
            };

            const renderBundleTreemap = (data) => {
                if (!bundleTreemap || !bundleTreemap.getContext) return;
                const ctx = bundleTreemap.getContext('2d');
                const width = bundleTreemap.width;
                const height = bundleTreemap.height;
                ctx.clearRect(0, 0, width, height);
                const items = (data.bundles || []).filter((b) => b.size > 0).sort((a, b) => b.size - a.size);
                const total = items.reduce((s, i) => s + i.size, 0) || 1;
                let x = 0;
                items.slice(0, 12).forEach((item) => {
                    const w = Math.max(20, (item.size / total) * width);
                    ctx.fillStyle = item.blocking ? '#f87171' : '#22c55e';
                    ctx.fillRect(x, 0, w, height);
                    ctx.fillStyle = '#0b1324';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(`${item.name} (${formatBytes(item.size)})`, x + 4, 14);
                    x += w;
                });
            };

            const renderBundleFindings = (data) => {
                if (!bundleFindings) return;
                bundleFindings.innerHTML = '';
                const items = [];
                if ((data.duplicates || []).length) {
                    data.duplicates.forEach((dup) => items.push({ text: `Duplicate script "${dup.key}" (${dup.count} copies). Remove extra copies or vendor split.`, tone: 'warn' }));
                }
                const blocking = (data.bundles || []).filter((b) => b.blocking);
                if (blocking.length) {
                    items.push({ text: `${blocking.length} blocking scripts detected. Add defer/async or move below fold.`, tone: 'error' });
                }
                if ((data.totalSize || 0) > 800000) {
                    items.push({ text: `JS transfer is heavy (${formatBytes(data.totalSize)}). Consider code splitting and tree shaking.`, tone: 'warn' });
                }
                if (!items.length) {
                    items.push({ text: 'Bundles look reasonable; no major issues detected.', tone: 'success' });
                }
                items.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = item.text;
                    const pill = document.createElement('span');
                    pill.className = 'plugency-pill ' + (item.tone === 'error' ? 'error' : item.tone === 'warn' ? 'warn' : 'success');
                    pill.textContent = item.tone === 'success' ? 'OK' : 'Review';
                    row.appendChild(text);
                    row.appendChild(pill);
                    bundleFindings.appendChild(row);
                });
            };

            const renderBundleDuplicates = (data) => {
                if (!bundleDuplicates) return;
                bundleDuplicates.innerHTML = '';
                if (!(data.coverage || []).length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No coverage estimates available.';
                    row.appendChild(text);
                    bundleDuplicates.appendChild(row);
                    return;
                }
                data.coverage.slice(0, 8).forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = item.name;
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `Unused ~${item.unused}% | ${formatBytes(item.size)}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    bundleDuplicates.appendChild(row);
                });
            };

            const renderBundleDeps = (data) => {
                if (!bundleDeps) return;
                const lines = [];
                (data.deps || []).slice(0, 12).forEach((dep) => {
                    lines.push(`${dep.from} -> ${dep.to}`);
                });
                bundleDeps.textContent = lines.length ? lines.join('\n') : 'No dependency edges detected.';
            };

            exportBundleReport = (data) => {
                const nodes = (data.bundles || []).map((b) => ({ name: b.name, size: b.size }));
                const payload = { version: 1, nodes };
                openActionModal({
                    title: 'Bundle analysis export',
                    message: 'Compatible JSON for webpack-bundle-analyzer.',
                    code: JSON.stringify(payload, null, 2),
                    copyLabel: 'Copy report',
                });
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

            runA11yAudit = () => {
                const issues = [];
                const elements = Array.from(document.querySelectorAll('*'));
                elements.forEach((el) => {
                    if (!el) return;
                    const cs = getComputedStyle(el);
                    if (el.textContent && el.textContent.trim().length > 0) {
                        const ratio = contrastRatio(cs.color, getBgColor(el));
                        if (ratio < 4.5) {
                            issues.push({ type: 'contrast', severity: classifySeverity('contrast'), message: `Low contrast (${ratio.toFixed(2)}:1)`, element: el });
                        }
                    }
                    if ((el.getAttribute('role') && (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')))) {
                        issues.push({ type: 'aria', severity: classifySeverity('aria'), message: `Role ${el.getAttribute('role')} missing accessible name`, element: el });
                    }
                });
                document.querySelectorAll('img').forEach((img) => {
                    const alt = img.getAttribute('alt');
                    if (alt === null || alt === '') {
                        issues.push({ type: 'alt', severity: 'critical', message: 'Image missing alt text', element: img });
                    }
                });
                document.querySelectorAll('input, select, textarea').forEach((field) => {
                    const hasLabel = field.id && document.querySelector(`label[for="${field.id}"]`);
                    const named = hasLabel || field.getAttribute('aria-label') || field.getAttribute('aria-labelledby');
                    if (!named) {
                        issues.push({ type: 'form', severity: 'serious', message: 'Form control missing label', element: field });
                    }
                });
                const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
                let lastLevel = 0;
                headings.forEach((h) => {
                    const level = parseInt(h.tagName.replace('H', ''), 10);
                    if (lastLevel && level - lastLevel > 1) {
                        issues.push({ type: 'heading', severity: 'moderate', message: `Heading jump from H${lastLevel} to H${level}`, element: h });
                    }
                    lastLevel = level;
                });
                const focusables = Array.from(document.querySelectorAll('a[href], button, [role="button"], input, select, textarea, [tabindex]'));
                focusables.forEach((el) => {
                    const tabindex = el.getAttribute('tabindex');
                    if (tabindex === '-1') {
                        issues.push({ type: 'keyboard', severity: 'serious', message: 'Focusable element removed from tab order', element: el });
                    }
                    const outline = getComputedStyle(el).outlineStyle;
                    if (outline === 'none') {
                        issues.push({ type: 'focus', severity: 'moderate', message: 'Focus indicator may be hidden', element: el });
                    }
                });
                const animated = Array.from(document.querySelectorAll('*')).filter((el) => {
                    const style = getComputedStyle(el);
                    return (style.animationDuration && style.animationDuration !== '0s') || (style.transitionDuration && style.transitionDuration !== '0s');
                });
                animated.slice(0, 20).forEach((el) => {
                    issues.push({ type: 'motion', severity: 'moderate', message: 'Animated element—ensure reduced motion support', element: el });
                });
                const keyOrder = focusables.some((el, idx) => idx > 0 && el.compareDocumentPosition(focusables[idx - 1]) & Node.DOCUMENT_POSITION_PRECEDING);
                if (keyOrder) {
                    issues.push({ type: 'keyboard', severity: 'serious', message: 'Tab order may be non-linear', element: focusables[0] });
                }
                a11yIssuesState = issues;
                renderA11yIssues();
            };

            const renderA11yIssues = () => {
                if (!a11yIssues) return;
                a11yIssues.innerHTML = '';
                if (!a11yIssuesState.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No issues found.';
                    row.appendChild(text);
                    a11yIssues.appendChild(row);
                } else {
                    a11yIssuesState.slice(0, 40).forEach((issue) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item plugency-perf-row';
                        const label = document.createElement('div');
                        label.className = 'plugency-path';
                        label.textContent = `${issue.message}`;
                        const meta = document.createElement('div');
                        meta.className = 'plugency-accordion-meta';
                        meta.textContent = `${issue.type} | ${issue.severity}`;
                        const pill = document.createElement('span');
                        pill.className = 'plugency-pill ' + (issue.severity === 'critical' ? 'error' : issue.severity === 'serious' ? 'warn' : 'success');
                        pill.textContent = issue.severity;
                        row.appendChild(label);
                        row.appendChild(meta);
                        row.appendChild(pill);
                        row.addEventListener('click', () => highlightElement(issue.element));
                        a11yIssues.appendChild(row);
                    });
                }
                if (a11yScoreBadge) {
                    const penalty = a11yIssuesState.reduce((sum, i) => sum + (i.severity === 'critical' ? 8 : i.severity === 'serious' ? 5 : 2), 0);
                    const score = Math.max(0, 100 - penalty);
                    a11yScoreBadge.textContent = `Score ${score}`;
                    a11yScoreBadge.className = 'plugency-badge ' + (score > 90 ? 'success' : score > 70 ? 'warn' : 'warn');
                }
                if (a11yFixBtn) a11yFixBtn.disabled = a11yIssuesState.length === 0;
                if (a11yExportBtn) a11yExportBtn.disabled = a11yIssuesState.length === 0;
            };

            fixCommonA11y = () => {
                let fixes = 0;
                a11yIssuesState.forEach((issue) => {
                    const el = issue.element;
                    if (!el) return;
                    if (issue.type === 'alt' && el.tagName === 'IMG') {
                        el.setAttribute('alt', 'Image description needed');
                        fixes++;
                    }
                    if (issue.type === 'form' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
                        if (!el.getAttribute('aria-label')) {
                            el.setAttribute('aria-label', 'Form field');
                            fixes++;
                        }
                    }
                    if (issue.type === 'contrast') {
                        el.style.color = '#111';
                        el.style.backgroundColor = '#fff';
                        fixes++;
                    }
                    if (issue.type === 'focus') {
                        el.style.outline = '2px solid #22c55e';
                        fixes++;
                    }
                });
                setStatus(`Applied ${fixes} quick fixes. Review manually for accuracy.`, fixes ? 'success' : 'info');
                runA11yAudit();
            };

            exportA11yReport = () => {
                const payload = a11yIssuesState.map((i) => ({
                    type: i.type,
                    severity: i.severity,
                    message: i.message,
                    selector: i.element ? i.element.tagName.toLowerCase() + (i.element.id ? `#${i.element.id}` : '') : '',
                }));
                openActionModal({
                    title: 'Accessibility report',
                    message: 'Copy and share WCAG findings.',
                    code: JSON.stringify(payload, null, 2),
                    copyLabel: 'Copy report',
                });
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

            const detectMissingDimensions = (images) => {
                return (images || []).filter((img) => !img.naturalWidth || !img.naturalHeight || !img.renderedWidth || !img.renderedHeight);
            };

            const buildSrcsetSuggestion = (img) => {
                if (!img || !img.src) return null;
                const widths = [480, 768, 1200, 1600].filter((w) => w < (img.naturalWidth || 2000));
                const srcset = widths.map((w) => `${img.src} ${w}w`).join(', ');
                const sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 1200px';
                return { srcset, sizes, widths };
            };

            const estimateLighthouseGain = (images) => {
                const avgSaving = images.length ? images.reduce((sum, img) => sum + estimateSavingsPct(img), 0) / images.length : 0;
                if (avgSaving > 0.4) return 'Likely +8-15 on Performance (images)';
                if (avgSaving > 0.2) return 'Likely +4-8 on Performance (images)';
                if (avgSaving > 0.1) return 'Some improvement expected';
                return 'Low impact expected';
            };

            const renderBeforeAfter = (first) => {
                if (!optimizerBefore || !optimizerAfter || !optimizerSlider) {
                    return;
                }
                if (first && first.src) {
                    optimizerBefore.src = first.src;
                    optimizerAfter.src = first.src;
                }
                optimizerSlider.addEventListener('input', () => {
                    const val = optimizerSlider.value;
                    optimizerAfter.style.clipPath = `inset(0 0 0 ${val}%)`;
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
                    const dims = `${first.renderedWidth || 0}×${first.renderedHeight || 0}px rendered | natural ${first.naturalWidth || 0}×${first.naturalHeight || 0}px`;
                    const sizeText = first.transfer ? ` | transfer ${formatBytes(first.transfer)}` : '';
                    optimizerMeta.textContent = `${dims}${sizeText}`;
                }
                if (optimizerPath) {
                    optimizerPath.textContent = first.src || '';
                }
                if (optimizerEstimate) {
                    const avg = Math.round((images.reduce((sum, img) => sum + estimateSavingsPct(img), 0) / Math.max(1, images.length)) * 100);
                    optimizerEstimate.textContent = `Estimated savings: ~${avg}% (based on current render size and transfer).`;
                }
                if (optimizerLighthouse) {
                    optimizerLighthouse.textContent = `Estimated Lighthouse improvement: ${estimateLighthouseGain(images)}`;
                }
                renderBeforeAfter(first);
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

            const renderThirdPartyGovernance = (thirdPartyData, entries) => {
                if (!thirdGovCard) return;
                const scripts = (entries || []).filter((e) => (e.initiatorType || '').toLowerCase() === 'script');
                const siteHost = window.location.host;
                const items = [];
                scripts.forEach((s) => {
                    let host = '';
                    try {
                        host = new URL(s.name).host;
                    } catch (e) {
                        host = '';
                    }
                    if (!host || host === siteHost) return;
                    const cascades = scripts.filter((t) => t !== s && normalizeKey(t.name).includes(host)).length;
                    const dataEntry = {
                        name: host,
                        url: s.name,
                        size: s.transferSize || s.decodedBodySize || 0,
                        duration: s.duration || 0,
                        start: s.startTime || 0,
                        privacy: host.match(/analytics|ads|pixel|track|tag|social/i) ? 'high' : 'medium',
                        cascades,
                    };
                    items.push(dataEntry);
                });
                items.sort((a, b) => (b.size + b.duration) - (a.size + a.duration));
                if (thirdGovList) {
                    thirdGovList.innerHTML = '';
                    if (!items.length) {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item';
                        const text = document.createElement('span');
                        text.className = 'plugency-source';
                        text.textContent = 'No external scripts detected.';
                        row.appendChild(text);
                        thirdGovList.appendChild(row);
                    } else {
                        items.slice(0, 10).forEach((item) => {
                            const row = document.createElement('div');
                            row.className = 'plugency-list-item plugency-perf-row';
                            const label = document.createElement('div');
                            label.className = 'plugency-path';
                            label.textContent = item.name;
                            const meta = document.createElement('div');
                            meta.className = 'plugency-accordion-meta';
                            meta.textContent = `${formatBytes(item.size)} | ${formatMs(item.duration)} | cascades ${item.cascades}`;
                            const pill = document.createElement('span');
                            pill.className = 'plugency-pill ' + (item.privacy === 'high' ? 'warn' : 'success');
                            pill.textContent = item.privacy === 'high' ? 'Privacy risk' : 'External';
                            row.appendChild(label);
                            row.appendChild(meta);
                            row.appendChild(pill);
                            thirdGovList.appendChild(row);
                        });
                    }
                }
                if (thirdGovStrategy) {
                    thirdGovStrategy.innerHTML = '';
                    const strat = [];
                    if ((thirdPartyData.hosts || []).length > 3) {
                        strat.push('Delay non-critical third-parties until user interaction (scroll/click).');
                    }
                    if (items.some((i) => i.duration > 400 || i.size > 120000)) {
                        strat.push('Use async/defer or facade embeds for heavy scripts (maps, chat, video).');
                    }
                    if (items.some((i) => i.privacy === 'high')) {
                        strat.push('Request consent before loading analytics/ads. Integrate with your CMP.');
                    }
                    strat.push('Test load order: place analytics after critical path, preconnect to key hosts.');
                    strat.forEach((tip) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item';
                        const text = document.createElement('span');
                        text.className = 'plugency-source';
                        text.textContent = tip;
                        row.appendChild(text);
                        thirdGovStrategy.appendChild(row);
                    });
                }
                if (thirdGovMeta) {
                    const totalSize = items.reduce((sum, i) => sum + i.size, 0);
                    thirdGovMeta.textContent = `${items.length} scripts | ${formatBytes(totalSize)}`;
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
                    convert_avif: true,
                    generate_srcset: true,
                    add_lqip: true,
                    lazy_fallback: true,
                    update_db: false,
                    remove_original: false,
                    lossless: false,
                    backup_originals: true,
                    detect_focal_point: true,
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
                if (optimizerProgress) {
                    optimizerProgress.style.display = 'block';
                    if (optimizerProgressBar) optimizerProgressBar.style.width = '10%';
                    if (optimizerProgressLabel) optimizerProgressLabel.textContent = 'Uploading images...';
                }
                if (optimizerStatus) {
                    optimizerStatus.textContent = 'Optimizing images...';
                    optimizerStatus.className = 'plugency-status info';
                }
                post('plugency_optimize_images', payload)
                    .then((data) => {
                        lastOptimizationResults = data;
                        if (optimizerStatus) {
                            optimizerStatus.textContent = 'Optimization finished.';
                            optimizerStatus.className = 'plugency-status success';
                        }
                        if (optimizerProgressBar) optimizerProgressBar.style.width = '100%';
                        if (optimizerProgressLabel) optimizerProgressLabel.textContent = 'Complete';
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

            const runBulkOptimization = () => {
                if (!collectedImages.length) {
                    setStatus('No images detected for bulk optimisation.', 'error');
                    return;
                }
                optimizationQueue = collectedImages.slice(0);
                if (optimizerProgress) {
                    optimizerProgress.style.display = 'block';
                }
                const processNext = (idx = 0) => {
                    if (idx >= optimizationQueue.length) {
                        setStatus('Bulk optimisation simulated.', 'success');
                        if (optimizerRollbackBtn) optimizerRollbackBtn.disabled = false;
                        return;
                    }
                    const percent = Math.round(((idx + 1) / optimizationQueue.length) * 100);
                    if (optimizerProgressBar) optimizerProgressBar.style.width = `${percent}%`;
                    if (optimizerProgressLabel) optimizerProgressLabel.textContent = `Processing ${idx + 1}/${optimizationQueue.length}`;
                    setTimeout(() => processNext(idx + 1), 150);
                };
                processNext(0);
            };

            const rollbackOptimization = () => {
                if (!lastOptimizationResults) {
                    setStatus('No optimisation run to rollback.', 'error');
                    return;
                }
                setStatus('Rollback request queued (requires manual restore from backups).', 'info');
            };

            const populate = () => {
                const entries = getResourceEntries();
                const resourceIndex = buildResourceIndex(entries);
                const navMetrics = collectNavigationMetrics();
                const summary = summarizeResources(entries);
                const blockingAssets = findBlockingAssets(entries, navMetrics);
                const bundleData = analyzeBundles(entries);
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
                renderThirdPartyGovernance(thirdParty, entries);
                renderHeavyScripts(perfJsList, heavyScripts);
                renderBundleTreemap(bundleData);
                renderBundleFindings(bundleData);
                renderBundleDuplicates(bundleData);
                renderBundleDeps(bundleData);
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
                if (bundleMeta) {
                    bundleMeta.textContent = `${bundleData.bundles.length} scripts | ${formatBytes(bundleData.totalSize || 0)}`;
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
                if (updateWcPerf) {
                    updateWcPerf(latestPerfSummary);
                }
                const budgetActuals = {
                    lcp_ms: lcpEntry ? (lcpEntry.renderTime || lcpEntry.loadTime || null) : null,
                    fid_ms: firstInputDelay,
                    cls: clsValue || 0,
                    weight_kb: summary.totalTransfer ? summary.totalTransfer / 1024 : null,
                    requests: summary.totalCount || null,
                };
                evaluateBudgets(budgetActuals);
            };

            const initPerfMonitor = () => {
                if (!perfMonitorCard) return;
                const normalizeTests = (data) => {
                    const base = { history: [], alerts: [], schedules: [], webhook: '' };
                    const merged = { ...base, ...(data || {}) };
                    merged.history = Array.isArray(merged.history) ? merged.history.slice(0, 80) : [];
                    merged.alerts = Array.isArray(merged.alerts) ? merged.alerts.slice(0, 80) : [];
                    merged.schedules = Array.isArray(merged.schedules) ? merged.schedules : [];
                    merged.webhook = merged.webhook || '';
                    return merged;
                };
                perfTests = normalizeTests(perfTests);

                const plugencyDevHelpInterval = (freq) => ({
                    '15m': 900,
                    hourly: 3600,
                    '6h': 21600,
                    daily: 86400,
                    weekly: 604800,
                }[freq] || 3600);

                const setMeta = (text, tone = 'neutral') => {
                    if (!perfMonitorMeta) return;
                    perfMonitorMeta.textContent = text;
                    perfMonitorMeta.className = `plugency-badge ${tone}`;
                };

                const renderSimpleList = (target, items, empty) => {
                    if (!target) return;
                    target.innerHTML = '';
                    if (!items || !items.length) {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item';
                        const span = document.createElement('span');
                        span.className = 'plugency-source';
                        span.textContent = empty;
                        row.appendChild(span);
                        target.appendChild(row);
                        return;
                    }
                    items.forEach((item) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item plugency-perf-row';
                        const title = document.createElement('div');
                        title.className = 'plugency-path';
                        title.textContent = item.title || '';
                        row.appendChild(title);
                        if (item.desc) {
                            const desc = document.createElement('span');
                            desc.className = 'plugency-source';
                            desc.textContent = item.desc;
                            row.appendChild(desc);
                        }
                        const meta = document.createElement('div');
                        meta.className = 'plugency-accordion-meta';
                        meta.textContent = item.meta || '';
                        row.appendChild(meta);
                        if (item.tone) {
                            const pill = document.createElement('span');
                            pill.className = 'plugency-pill';
                            pill.classList.add(item.tone);
                            pill.textContent = item.tone;
                            row.appendChild(pill);
                        }
                        if (item.remove) {
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.className = 'plugency-button ghost';
                            btn.textContent = 'Remove';
                            btn.addEventListener('click', item.remove);
                            row.appendChild(btn);
                        }
                        target.appendChild(row);
                    });
                };

                const savePerfTests = () => post('plugency_save_perf_tests', { data: JSON.stringify(perfTests) }).catch(() => setStatus('Failed to save performance monitoring state.', 'error'));

                const addAlert = (message, meta = '', tone = 'warn') => {
                    perfTests.alerts.unshift({
                        ts: Date.now(),
                        message,
                        meta,
                        tone,
                    });
                    perfTests.alerts = perfTests.alerts.slice(0, 60);
                    renderAlerts();
                    savePerfTests();
                };

                const renderSchedules = () => {
                    const items = (perfTests.schedules || []).map((sched) => ({
                        title: sched.url || '(url)',
                        desc: `${sched.frequency || 'daily'} | ${sched.profile && sched.profile.device ? sched.profile.device : 'desktop'}`,
                        meta: `Next: ${sched.next_run ? new Date(sched.next_run * 1000).toLocaleString() : 'now'}`,
                        tone: sched.next_run && sched.next_run < Date.now() / 1000 ? 'warn' : 'neutral',
                        remove: () => {
                            perfTests.schedules = (perfTests.schedules || []).filter((s) => s.id !== sched.id);
                            renderSchedules();
                            savePerfTests();
                        },
                    }));
                    renderSimpleList(perfMonitorSchedules, items, 'No schedules yet.');
                };

                const renderAlerts = () => {
                    const items = (perfTests.alerts || []).slice(0, 6).map((alert) => ({
                        title: alert.message || 'Alert',
                        desc: alert.meta || new Date(alert.ts || Date.now()).toLocaleString(),
                        meta: alert.ts ? new Date(alert.ts).toLocaleTimeString() : '',
                        tone: alert.tone || 'warn',
                    }));
                    renderSimpleList(perfMonitorAlerts, items, 'No regressions detected.');
                };

                const renderLatest = () => {
                    const items = (perfTests.history || []).slice(0, 3).map((run) => ({
                        title: run.url || '(run)',
                        desc: `${run.profile?.device || 'desktop'} ${run.profile?.network || ''} | ${run.source || 'browser'}`,
                        meta: [
                            run.metrics?.lcp_ms ? `LCP ${formatMs(run.metrics.lcp_ms)}` : null,
                            run.metrics?.ttfb_ms ? `TTFB ${formatMs(run.metrics.ttfb_ms)}` : null,
                            run.metrics?.cls ? `CLS ${(run.metrics.cls || 0).toFixed(3)}` : null,
                        ].filter(Boolean).join(' | '),
                        tone: run.metrics && run.metrics.lcp_ms && run.metrics.lcp_ms > (budgets.lcp_ms || 0) ? 'warn' : 'neutral',
                    }));
                    renderSimpleList(perfMonitorLatest, items, 'Run a test to populate metrics.');
                };

                const renderHistory = () => {
                    const items = (perfTests.history || []).slice(0, 8).map((run) => ({
                        title: new Date(run.ts || Date.now()).toLocaleString(),
                        desc: `${run.url || ''}`,
                        meta: [
                            run.profile?.device || 'desktop',
                            run.profile?.network || '',
                            run.metrics?.lcp_ms ? `LCP ${formatMs(run.metrics.lcp_ms)}` : null,
                            run.metrics?.ttfb_ms ? `TTFB ${formatMs(run.metrics.ttfb_ms)}` : null,
                        ].filter(Boolean).join(' | '),
                    }));
                    renderSimpleList(perfMonitorHistory, items, 'No runs yet.');
                };

                const renderChart = () => {
                    if (!perfMonitorChart) return;
                    const ctx = perfMonitorChart.getContext('2d');
                    if (!ctx) return;
                    const data = (perfTests.history || []).slice(0, 20).reverse();
                    const w = perfMonitorChart.width;
                    const h = perfMonitorChart.height;
                    ctx.clearRect(0, 0, w, h);
                    if (!data.length) {
                        ctx.fillStyle = '#999';
                        ctx.fillText('No data yet.', 12, h / 2);
                        return;
                    }
                    const lcpValues = data.map((d) => d.metrics?.lcp_ms || 0).filter(Boolean);
                    const ttfbValues = data.map((d) => d.metrics?.ttfb_ms || 0).filter(Boolean);
                    const maxVal = Math.max(...lcpValues, ...ttfbValues, 1000);
                    const xStep = data.length > 1 ? w / (data.length - 1) : w;
                    const plotLine = (values, color) => {
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        values.forEach((val, idx) => {
                            const x = idx * xStep;
                            const y = h - ((val || 0) / maxVal) * (h - 16);
                            if (idx === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        });
                        ctx.stroke();
                    };
                    if (lcpValues.length) plotLine(lcpValues, '#3b82f6');
                    if (ttfbValues.length) plotLine(ttfbValues, '#22c55e');
                    ctx.fillStyle = '#666';
                    ctx.fillText(`Max: ${formatMs(maxVal)}`, 4, 12);
                };

                const renderAll = () => {
                    renderSchedules();
                    renderAlerts();
                    renderLatest();
                    renderHistory();
                    renderChart();
                    setMeta(`${(perfTests.history || []).length} runs | ${(perfTests.schedules || []).length} schedules`, (perfTests.alerts || []).length ? 'warn' : 'success');
                };

                const notifyWebhook = (result) => {
                    if (!perfTests.webhook) return;
                    try {
                        fetch(perfTests.webhook, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(result),
                        }).catch(() => {});
                    } catch (e) {
                        /* ignore */
                    }
                };

                const enforceBudgets = (metrics) => {
                    if (!metrics || !budgets) return;
                    Object.entries(budgets).forEach(([key, limit]) => {
                        const map = {
                            lcp_ms: metrics.lcp_ms,
                            fid_ms: metrics.fid_ms,
                            cls: metrics.cls,
                            weight_kb: metrics.weight_kb,
                            requests: metrics.requests,
                        };
                        const actual = map[key];
                        if (actual !== null && typeof actual !== 'undefined' && limit && actual > limit) {
                            addAlert(`Budget exceeded: ${key}`, `${actual} vs ${limit}`, 'error');
                        }
                    });
                };

                const checkRegression = (result) => {
                    const prev = (perfTests.history || []).find((item) => item.url === result.url && item.id !== result.id);
                    if (!prev || !prev.metrics) return;
                    const regressions = [];
                    ['lcp_ms', 'ttfb_ms', 'cls'].forEach((key) => {
                        const prevVal = prev.metrics[key] || 0;
                        const curVal = result.metrics[key] || 0;
                        if (prevVal && curVal && curVal > prevVal * 1.12 && curVal - prevVal > 40) {
                            if (key === 'cls') {
                                regressions.push(`CLS ${(curVal || 0).toFixed(3)} (was ${(prevVal || 0).toFixed(3)})`);
                            } else {
                                regressions.push(`${key.toUpperCase()} ${formatMs(curVal)} (was ${formatMs(prevVal)})`);
                            }
                        }
                    });
                    if (regressions.length) {
                        addAlert('Regression detected', regressions.join('; '), 'error');
                    }
                };

                const recordResult = (result, persist = true) => {
                    perfTests.history.unshift(result);
                    perfTests.history = perfTests.history.slice(0, 60);
                    enforceBudgets(result.metrics);
                    checkRegression(result);
                    renderAll();
                    if (persist) {
                        savePerfTests();
                        notifyWebhook(result);
                    }
                };

                const applyProfileMultiplier = (metrics, profileKey) => {
                    const profile = perfProfiles[profileKey] || perfProfiles.desktop;
                    const out = { ...metrics };
                    Object.keys(out).forEach((key) => {
                        if (typeof out[key] === 'number') {
                            out[key] = out[key] * profile.multiplier;
                        }
                    });
                    return { metrics: out, profile: { ...profile, id: profileKey } };
                };

                const runBrowserTest = async (profileKey = 'desktop', note = '') => {
                    if (perfMonitorRunBtn) setLoading(perfMonitorRunBtn, true, 'Testing...');
                    const entries = getResourceEntries();
                    const summary = summarizeResources(entries);
                    const nav = collectNavigationMetrics();
                    const profileMeta = applyProfileMultiplier(
                        {
                            lcp_ms: lcpEntry ? (lcpEntry.renderTime || lcpEntry.loadTime || 0) : null,
                            cls: clsValue || 0,
                            fid_ms: firstInputDelay || null,
                            ttfb_ms: nav.ttfb || null,
                            fcp_ms: paintMetrics.fcp || null,
                            fp_ms: paintMetrics.fp || null,
                            weight_kb: summary.totalTransfer ? summary.totalTransfer / 1024 : null,
                            requests: summary.totalCount || null,
                        },
                        profileKey
                    );
                    const result = {
                        id: `browser-${Date.now()}`,
                        ts: Date.now(),
                        url: window.location.href,
                        profile: profileMeta.profile,
                        metrics: profileMeta.metrics,
                        source: 'browser',
                        note: note || 'Front-end Performance API sample',
                    };
                    recordResult(result);
                    if (perfMonitorRunBtn) setLoading(perfMonitorRunBtn, false);
                    setStatus('Performance test captured.', 'success');
                };

                const runProbe = async (url, profileKey = 'desktop', note = '') => {
                    const start = performance.now();
                    let size = 0;
                    let status = 0;
                    try {
                        const res = await fetch(url, { credentials: 'include' });
                        status = res.status;
                        const text = await res.text();
                        size = text.length;
                    } catch (e) {
                        /* ignore */
                    }
                    const duration = performance.now() - start;
                    const profile = perfProfiles[profileKey] || perfProfiles.desktop;
                    const metrics = {
                        ttfb_ms: duration * profile.multiplier,
                        lcp_ms: null,
                        cls: null,
                        fid_ms: null,
                        fcp_ms: null,
                        fp_ms: null,
                        weight_kb: size ? size / 1024 : null,
                        requests: null,
                    };
                    const result = {
                        id: `probe-${Date.now()}`,
                        ts: Date.now(),
                        url,
                        profile: { ...profile, id: profileKey },
                        metrics,
                        source: 'probe',
                        note: note || (status ? `HTTP ${status} probe` : 'Probe failed'),
                    };
                    recordResult(result);
                };

                const maybeRunSchedules = () => {
                    if (!perfTests.schedules || !perfTests.schedules.length) return;
                    const now = Date.now() / 1000;
                    const due = perfTests.schedules.filter((s) => (s.next_run || 0) <= now);
                    if (!due.length) return;
                    due.slice(0, 2).forEach((sched) => {
                        const samePage = normalizeKey(sched.url) === normalizeKey(window.location.href);
                        const note = `Scheduled ${sched.frequency || 'daily'} check${sched.profile && sched.profile.device ? ` (${sched.profile.device})` : ''}`;
                        if (samePage) {
                            runBrowserTest((sched.profile && sched.profile.id) || 'desktop', note);
                        } else {
                            runProbe(sched.url, (sched.profile && sched.profile.id) || 'desktop', note);
                        }
                        sched.last_run = Math.floor(Date.now() / 1000);
                        sched.next_run = sched.last_run + plugencyDevHelpInterval(sched.frequency || 'daily');
                    });
                    savePerfTests();
                    renderSchedules();
                };

                const addSchedule = () => {
                    if (!perfMonitorFreq) return;
                    const url = perfMonitorUrl && perfMonitorUrl.value ? perfMonitorUrl.value : window.location.href;
                    const frequency = perfMonitorFreq.value || 'daily';
                    const profileKey = perfMonitorProfile ? perfMonitorProfile.value : 'desktop';
                    const profile = perfProfiles[profileKey] || perfProfiles.desktop;
                    perfTests.schedules = perfTests.schedules || [];
                    perfTests.schedules.push({
                        id: `sched-${Date.now()}`,
                        url,
                        frequency,
                        profile: { ...profile, id: profileKey },
                        next_run: Math.floor(Date.now() / 1000) + plugencyDevHelpInterval(frequency),
                        last_run: 0,
                    });
                    renderSchedules();
                    savePerfTests();
                    setStatus('Schedule added.', 'success');
                };

                const runPluginCheck = () => {
                    if (!perfMonitorPluginInput) return;
                    const slug = perfMonitorPluginInput.value || '(plugin update)';
                    const profileKey = perfMonitorProfile ? perfMonitorProfile.value : 'desktop';
                    runBrowserTest(profileKey, `Pre-activation baseline for ${slug}`);
                };

                const exportReport = () => {
                    const payload = {
                        generated_at: new Date().toISOString(),
                        latest: (perfTests.history || [])[0] || {},
                        history: (perfTests.history || []).slice(0, 15),
                        alerts: perfTests.alerts || [],
                        schedules: perfTests.schedules || [],
                    };
                    openActionModal({
                        title: 'Performance monitoring export',
                        message: 'Copy this JSON to share trends, alerts, and schedules.',
                        code: JSON.stringify(payload, null, 2),
                        copyLabel: 'Copy report',
                    });
                };

                const hydrateFromServer = () => post('plugency_get_perf_tests', {}).then((data) => {
                    perfTests = normalizeTests(data);
                    renderAll();
                }).catch(() => {});

                if (perfMonitorRunBtn) {
                    perfMonitorRunBtn.addEventListener('click', () => runBrowserTest(perfMonitorProfile ? perfMonitorProfile.value : 'desktop'));
                }
                if (perfMonitorAddBtn) {
                    perfMonitorAddBtn.addEventListener('click', addSchedule);
                }
                if (perfMonitorPluginCheck) {
                    perfMonitorPluginCheck.addEventListener('click', runPluginCheck);
                }
                if (perfMonitorExportBtn) {
                    perfMonitorExportBtn.addEventListener('click', exportReport);
                }
                if (perfMonitorWebhook) {
                    perfMonitorWebhook.addEventListener('change', () => {
                        perfTests.webhook = perfMonitorWebhook.value || '';
                        savePerfTests();
                    });
                    perfMonitorWebhook.value = perfTests.webhook || '';
                }

                renderAll();
                hydrateFromServer();
                if (perfMonitorTimer) clearInterval(perfMonitorTimer);
                perfMonitorTimer = setInterval(maybeRunSchedules, 30000);
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

            initFormUx();
            initPerfMonitor();
            initWcPerf();
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

            if (saveBudgetsBtn) {
                saveBudgetsBtn.addEventListener('click', () => {
                    saveBudgets();
                });
            }
            if (loadBudgetsBtn) {
                loadBudgetsBtn.addEventListener('click', () => {
                    loadBudgets();
                });
            }
            if (resetBudgetsBtn) {
                resetBudgetsBtn.addEventListener('click', () => {
                    resetBudgets();
                });
            }
            if (startMemoryBtn) {
                startMemoryBtn.addEventListener('click', () => {
                    startMemoryProfiler();
                });
            }
            if (stopMemoryBtn) {
                stopMemoryBtn.addEventListener('click', () => {
                    stopMemoryProfiler();
                });
            }
            if (exportMemoryBtn) {
                exportMemoryBtn.addEventListener('click', () => {
                    exportMemoryProfile();
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
            if (optimizerBulkBtn) {
                optimizerBulkBtn.addEventListener('click', runBulkOptimization);
            }
            if (optimizerRollbackBtn) {
                optimizerRollbackBtn.addEventListener('click', rollbackOptimization);
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

        initHeartbeatMonitor();
        initOpcache();
        initContentModels();
        initRenderBlocking();
        initPreloadEngine();
        initHeaderAudit();
        initCriticalCss();
        initSchemaTool();
        initPwaTool();
        initFontOptimizer();
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
        const queryOptimizerCard = panel.querySelector('[data-role="query-optimizer"]');
        const analyzeQueriesBtn = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-action="analyze-queries"]') : null;
        const exportQueryReportBtn = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-action="export-query-report"]') : null;
        const testOptimizedBtn = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-action="test-optimized-query"]') : null;
        const queryRecList = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-role="query-recommendations"]') : null;
        const queryPlanTable = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-role="query-plan-table"] tbody') : null;
        const queryHistoryChart = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-role="query-history-chart"]') : null;
        const queryHistoryWrapper = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-role="query-history-chart-wrapper"]') : null;
        const queryNote = queryOptimizerCard ? queryOptimizerCard.querySelector('[data-role="query-optimizer-note"]') : null;
        let queryAlternatives = [];
        let queryHistory = [];

        const loadQueryHistory = () => {
            try {
                const raw = localStorage.getItem('plugencyQueryHistory') || '[]';
                queryHistory = JSON.parse(raw);
            } catch (e) {
                queryHistory = [];
            }
        };
        const saveQueryHistory = () => {
            try {
                localStorage.setItem('plugencyQueryHistory', JSON.stringify(queryHistory.slice(-30)));
            } catch (e) {
                /* ignore */
            }
        };

        const renderQueryHistoryChart = () => {
            if (!queryHistoryChart || !queryHistoryChart.getContext) {
                return;
            }
            const ctx = queryHistoryChart.getContext('2d');
            const width = queryHistoryChart.width;
            const height = queryHistoryChart.height;
            ctx.clearRect(0, 0, width, height);
            const points = queryHistory.slice(-30);
            if (!points.length) {
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Run analysis to build history.', 8, 16);
                return;
            }
            const maxTime = Math.max(...points.map((p) => p.totalTime || 0), 0.1);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            points.forEach((p, idx) => {
                const x = (idx / Math.max(1, points.length - 1)) * (width - 10) + 5;
                const y = height - ((p.totalTime || 0) / maxTime) * (height - 20) - 5;
                if (idx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            ctx.fillStyle = '#9ca3b8';
            ctx.fillText(`Peak: ${points[points.length - 1].totalTime.toFixed(3)}s`, 8, height - 8);
        };

        const normalizeQueryText = (sql) => (sql || '').toLowerCase()
            .replace(/`/g, '')
            .replace(/'.*?'/g, '?')
            .replace(/\".*?\"/g, '?')
            .replace(/\b\d+\b/g, '?')
            .replace(/\s+/g, ' ')
            .trim();

        const extractColumns = (sql) => {
            const cols = [];
            const whereMatch = sql.match(/where\s+(.+?)(group\s+by|order\s+by|limit|$)/i);
            if (whereMatch && whereMatch[1]) {
                const parts = whereMatch[1].split(/\band\b|\bor\b/i);
                parts.forEach((p) => {
                    const m = p.match(/([a-z0-9_\\.]+)\s*=\s*[\?\:]/i) || p.match(/([a-z0-9_\\.]+)\s+in\s*\(/i);
                    if (m && m[1]) {
                        cols.push(m[1]);
                    }
                });
            }
            const joinMatches = sql.match(/join\s+([a-z0-9_\\.]+)\s+on\s+(.+?)(?=join|where|group|order|limit|$)/gi) || [];
            joinMatches.forEach((seg) => {
                const on = seg.match(/on\s+(.+)/i);
                if (on && on[1]) {
                    const m = on[1].match(/([a-z0-9_\\.]+)\s*=\s*([a-z0-9_\\.]+)/i);
                    if (m) {
                        cols.push(m[1], m[2]);
                    }
                }
            });
            return Array.from(new Set(cols));
        };

        const buildIndexName = (col) => {
            const clean = (col || '').replace(/\./g, '_').replace(/[^a-z0-9_]/gi, '');
            return `idx_${clean}`.slice(0, 60);
        };

        const renderQueryRecommendations = (items) => {
            if (!queryRecList) {
                return;
            }
            queryRecList.innerHTML = '';
            if (!items.length) {
                const row = document.createElement('div');
                row.className = 'plugency-list-item';
                const text = document.createElement('span');
                text.className = 'plugency-source';
                text.textContent = 'No issues found in current capture.';
                row.appendChild(text);
                queryRecList.appendChild(row);
                return;
            }
            items.forEach((rec) => {
                const row = document.createElement('div');
                row.className = 'plugency-list-item plugency-perf-row';
                const label = document.createElement('div');
                label.className = 'plugency-path';
                label.textContent = rec.title;
                const meta = document.createElement('div');
                meta.className = 'plugency-accordion-meta';
                meta.textContent = rec.detail;
                const pill = document.createElement('span');
                pill.className = 'plugency-pill';
                pill.textContent = rec.tone === 'error' ? 'Action' : 'Check';
                pill.classList.add(rec.tone === 'error' ? 'error' : 'warn');
                row.appendChild(label);
                row.appendChild(meta);
                row.appendChild(pill);
                queryRecList.appendChild(row);
            });
        };

        const renderPlanTable = (rows) => {
            if (!queryPlanTable) {
                return;
            }
            queryPlanTable.innerHTML = '';
            if (!rows.length) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 4;
                td.textContent = 'No plan comparisons generated.';
                tr.appendChild(td);
                queryPlanTable.appendChild(tr);
                return;
            }
            rows.forEach((row) => {
                const tr = document.createElement('tr');
                const q = document.createElement('td');
                q.textContent = row.query;
                const before = document.createElement('td');
                before.textContent = row.before || 'Est. table scan';
                const after = document.createElement('td');
                after.textContent = row.after || 'Add index';
                const gain = document.createElement('td');
                gain.textContent = row.gain || 'n/a';
                tr.appendChild(q);
                tr.appendChild(before);
                tr.appendChild(after);
                tr.appendChild(gain);
                queryPlanTable.appendChild(tr);
            });
        };

        const analyzeQueries = () => {
            if (!queryOptimizerCard || !snapshotData || !snapshotData.query_tables) {
                setStatus('No queries available for analysis.', 'error');
                return;
            }
            const tableQueries = Array.isArray(snapshotData.query_tables.table) ? snapshotData.query_tables.table : [];
            const duplicates = Array.isArray(snapshotData.query_tables.duplicates) ? snapshotData.query_tables.duplicates : [];
            const slowest = Array.isArray(snapshotData.insights?.slowest) ? snapshotData.insights.slowest : [];
            const recs = [];
            const planRows = [];
            const alternatives = [];
            const normalizedMap = new Map();
            tableQueries.forEach((row) => {
                const norm = normalizeQueryText(row.sql || '');
                if (!normalizedMap.has(norm)) {
                    normalizedMap.set(norm, []);
                }
                normalizedMap.get(norm).push(row);
            });
            normalizedMap.forEach((rows, norm) => {
                if (rows.length >= 4) {
                    recs.push({
                        title: `Possible N+1: "${norm.slice(0, 72)}..."`,
                        detail: `${rows.length} similar queries. Batch or eager-load related data.`,
                        tone: 'warn',
                    });
                }
            });
            duplicates.slice(0, 6).forEach((dup) => {
                const cols = extractColumns(dup.sql || '');
                if (cols.length) {
                    const idxName = buildIndexName(cols.join('_'));
                    recs.push({
                        title: 'Index opportunity',
                        detail: `${dup.sql.slice(0, 64)}... → CREATE INDEX ${idxName} ON ? (${cols.join(', ')});`,
                        tone: 'error',
                    });
                    planRows.push({
                        query: dup.sql.slice(0, 50) + '...',
                        before: 'Full scan suspected',
                        after: `Index ${idxName}`,
                        gain: 'Est. 30-60% faster',
                    });
                    alternatives.push({
                        sql: dup.sql,
                        migration: `CREATE INDEX ${idxName} ON your_table (${cols.join(', ')});`,
                        note: 'Based on WHERE/JOIN patterns. Adjust table name before running.',
                    });
                }
            });
            const joins = [];
            tableQueries.slice(0, 50).forEach((row) => {
                const joinMatches = (row.sql || '').match(/join\s+([a-z0-9_`\\.]+)/ig) || [];
                if (joinMatches.length >= 3) {
                    recs.push({
                        title: 'Heavy JOIN chain',
                        detail: `${joinMatches.length} JOINs detected. Check missing foreign keys and add selective indexes.`,
                        tone: 'warn',
                    });
                    joins.push(row.sql);
                }
            });
            slowest.slice(0, 3).forEach((row) => {
                const cols = extractColumns(row.sql || '');
                if (cols.length) {
                    const idxName = buildIndexName(cols.join('_'));
                    planRows.push({
                        query: (row.sql || '').slice(0, 50) + '...',
                        before: 'Slow plan',
                        after: `Index ${idxName}`,
                        gain: `Est. ${(Math.min(90, Math.max(20, cols.length * 10)))}% faster`,
                    });
                }
            });
            if (!recs.length) {
                recs.push({
                    title: 'No obvious issues',
                    detail: 'Queries look healthy in this capture.',
                    tone: 'warn',
                });
            }
            renderQueryRecommendations(recs.slice(0, 10));
            renderPlanTable(planRows.slice(0, 6));
            queryAlternatives = alternatives.slice(0, 5);
            if (exportQueryReportBtn) {
                exportQueryReportBtn.disabled = false;
            }
            if (testOptimizedBtn) {
                testOptimizedBtn.disabled = queryAlternatives.length === 0;
            }
            const totalTime = (snapshotData.insights && snapshotData.insights.time) ? snapshotData.insights.time : 0;
            queryHistory.push({ t: Date.now(), totalTime });
            queryHistory = queryHistory.slice(-30);
            saveQueryHistory();
            renderQueryHistoryChart();
            setStatus('Query analysis complete.', 'success');
        };

        const exportQueryReport = () => {
            const payload = {
                captured_at: new Date().toISOString(),
                total_time: snapshotData?.insights?.time || 0,
                total_queries: snapshotData?.insights?.total || 0,
                recommendations: Array.from(queryRecList?.querySelectorAll('.plugency-list-item .plugency-path') || []).map((n) => n.textContent || ''),
                plans: queryPlanTable ? Array.from(queryPlanTable.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent)) : [],
            };
            const pretty = JSON.stringify(payload, null, 2);
            openActionModal({
                title: 'Query optimization report',
                message: 'Copy these tasks into your backlog.',
                code: pretty,
                copyLabel: 'Copy report',
                hint: 'Includes recommendations and plan hints.',
            });
        };

        const testOptimizedQuery = () => {
            if (!queryAlternatives.length) {
                setStatus('No alternative queries generated yet.', 'error');
                return;
            }
            const alt = queryAlternatives[0];
            const code = `${alt.sql}\n\n-- Suggested index\n${alt.migration}`;
            openActionModal({
                title: 'Optimized query prototype',
                message: alt.note || 'Adjust table/column names before running.',
                code,
                copyLabel: 'Copy optimized query',
                hint: 'Run explain on this SQL to validate improvement.',
            });
        };

        if (queryHistoryWrapper) {
            loadQueryHistory();
            renderQueryHistoryChart();
        }
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

        if (analyzeQueriesBtn) {
            analyzeQueriesBtn.addEventListener('click', analyzeQueries);
        }
        if (exportQueryReportBtn) {
            exportQueryReportBtn.addEventListener('click', exportQueryReport);
        }
        if (testOptimizedBtn) {
            testOptimizedBtn.addEventListener('click', testOptimizedQuery);
        }

        if (queryTabs.length) {
            const defaultTab = panel.querySelector('[data-query-tab].active') || queryTabs[0];
            activateQueryTab(defaultTab.getAttribute('data-query-tab'));
        }

        const queryViewToggle = panel.querySelector('[data-query-view-toggle]');
        const queryViewLabel = panel.querySelector('[data-query-view-label]');
        const apiSection = panel.querySelector('[data-section="api"]');
        const apiList = apiSection ? apiSection.querySelector('[data-role="api-list"]') : null;
        const apiStatus = apiSection ? apiSection.querySelector('[data-role="api-status"]') : null;
        const apiDetail = apiSection ? apiSection.querySelector('[data-role="api-detail"] pre') : null;
        const apiDetailBadge = apiSection ? apiSection.querySelector('[data-role="api-detail-badge"]') : null;
        const apiFilterEndpoint = apiSection ? apiSection.querySelector('[data-role="api-filter-endpoint"]') : null;
        const apiFilterMethod = apiSection ? apiSection.querySelector('[data-role="api-filter-method"]') : null;
        const apiFilterStatus = apiSection ? apiSection.querySelector('[data-role="api-filter-status"]') : null;
        const apiFilterLatency = apiSection ? apiSection.querySelector('[data-role="api-filter-latency"]') : null;
        const apiWaterfall = apiSection ? apiSection.querySelector('[data-role="api-waterfall"]') : null;
        const apiWaterfallWrapper = apiSection ? apiSection.querySelector('[data-role="api-waterfall-wrapper"]') : null;
        const exportApiBtn = apiSection ? apiSection.querySelector('[data-action="export-api-log"]') : null;
        const clearApiBtn = apiSection ? apiSection.querySelector('[data-action="clear-api-log"]') : null;
        const toggleMockApiBtn = apiSection ? apiSection.querySelector('[data-action="toggle-mock-api"]') : null;
        const copyApiCurlBtn = apiSection ? apiSection.querySelector('[data-action="copy-api-curl"]') : null;
        const replayApiBtn = apiSection ? apiSection.querySelector('[data-action="replay-api"]') : null;
        const mockApiRespBtn = apiSection ? apiSection.querySelector('[data-action="mock-api-response"]') : null;
        let apiLogs = [];
        let mockApiMode = false;
        let selectedApiId = null;
        const transientCard = panel.querySelector('[data-role="transient-card"]');
        const transientBadge = transientCard ? transientCard.querySelector('[data-role="transient-badge"]') : null;
        const transientSearch = transientCard ? transientCard.querySelector('[data-role="transient-search"]') : null;
        const transientTable = transientCard ? transientCard.querySelector('[data-role="transient-table"] tbody') : null;
        const transientNote = transientCard ? transientCard.querySelector('[data-role="transient-note"]') : null;
        const transientChart = transientCard ? transientCard.querySelector('[data-role="transient-chart"]') : null;
        const transientSpace = transientCard ? transientCard.querySelector('[data-role="transient-space"]') : null;
        const transientReco = transientCard ? transientCard.querySelector('[data-role="transient-recommendations"]') : null;
        const cleanupTransientsBtn = transientCard ? transientCard.querySelector('[data-action="cleanup-transients"]') : null;
        const exportTransientsBtn = transientCard ? transientCard.querySelector('[data-action="export-transients"]') : null;
        const transientsData = snapshotData.transients || {};
        let transientItems = Array.isArray(transientsData.items) ? transientsData.items : [];
        let transientHistory = [];
        const pluginConflictCard = panel.querySelector('[data-role="plugin-conflict-card"]');
        const pluginConflictMeta = pluginConflictCard ? pluginConflictCard.querySelector('[data-role="plugin-conflict-meta"]') : null;
        const pluginConflictWarnings = pluginConflictCard ? pluginConflictCard.querySelector('[data-role="plugin-conflict-warnings"]') : null;
        const pluginDuplicateList = pluginConflictCard ? pluginConflictCard.querySelector('[data-role="plugin-duplicate-list"]') : null;
        const pluginConsoleList = pluginConflictCard ? pluginConflictCard.querySelector('[data-role="plugin-console-list"]') : null;
        const pluginCssConflicts = pluginConflictCard ? pluginConflictCard.querySelector('[data-role="plugin-css-conflicts"]') : null;
        const pluginMatrix = pluginConflictCard ? pluginConflictCard.querySelector('[data-role="plugin-matrix"] pre') : null;
        const exportPluginConflictsBtn = pluginConflictCard ? pluginConflictCard.querySelector('[data-action="export-plugin-conflicts"]') : null;
        let consoleErrors = [];
        const coverageCard = panel.querySelector('[data-role="coverage-card"]');
        const coverageHeatmap = coverageCard ? coverageCard.querySelector('[data-role="coverage-heatmap"]') : null;
        const coverageHeatmapWrapper = coverageCard ? coverageCard.querySelector('[data-role="coverage-heatmap-wrapper"]') : null;
        const coverageTop = coverageCard ? coverageCard.querySelector('[data-role="coverage-top"]') : null;
        const coverageUnusedList = coverageCard ? coverageCard.querySelector('[data-role="coverage-unused"]') : null;
        const coverageCallgraph = coverageCard ? coverageCard.querySelector('[data-role="coverage-callgraph"] pre') : null;
        const coverageMeta = coverageCard ? coverageCard.querySelector('[data-role="coverage-meta"]') : null;
        const exportCoverageBtn = coverageCard ? coverageCard.querySelector('[data-action="export-coverage"]') : null;
        const showUnusedBtn = coverageCard ? coverageCard.querySelector('[data-action="show-unused"]') : null;
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

        const loadTransientHistory = () => {
            try {
                const raw = localStorage.getItem('plugencyTransientHistory') || '[]';
                transientHistory = JSON.parse(raw);
            } catch (e) {
                transientHistory = [];
            }
        };

        const saveTransientHistory = () => {
            try {
                localStorage.setItem('plugencyTransientHistory', JSON.stringify(transientHistory.slice(-40)));
            } catch (e) {
                /* ignore */
            }
        };

        const renderTransientBadge = () => {
            if (!transientBadge) return;
            const c = transientsData.counts || {};
            transientBadge.textContent = `${c.total || 0} total | ${c.expired || 0} expired | ${c.orphan || 0} orphan`;
            transientBadge.className = 'plugency-badge ' + ((c.expired || 0) > 0 ? 'warn' : 'success');
        };

        const renderTransientSpace = () => {
            if (!transientSpace) return;
            const space = transientsData.space || {};
            transientSpace.textContent = `${space.total_readable || '0'} (expired ${space.expired_readable || '0'})`;
        };

        const formatTransientBytes = (val) => {
            const num = Number(val) || 0;
            if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
            if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
            return `${Math.round(num)} B`;
        };

        const renderTransientTable = () => {
            if (!transientTable) return;
            transientTable.innerHTML = '';
            const search = (transientSearch && transientSearch.value || '').toLowerCase();
            const filtered = transientItems.filter((item) => {
                const hay = `${item.name || ''} ${item.source || ''} ${item.status || ''}`.toLowerCase();
                return hay.includes(search);
            }).slice(0, 200);
            if (!filtered.length) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 6;
                td.textContent = 'No transients match your search.';
                tr.appendChild(td);
                transientTable.appendChild(tr);
                return;
            }
            filtered.forEach((item) => {
                const tr = document.createElement('tr');
                const name = document.createElement('td');
                name.textContent = item.name || '(unknown)';
                const status = document.createElement('td');
                status.textContent = item.status || '';
                const expires = document.createElement('td');
                const ts = item.expires ? new Date(item.expires * 1000).toLocaleString() : 'n/a';
                expires.textContent = ts;
                const size = document.createElement('td');
                size.textContent = formatTransientBytes(item.size || 0);
                const source = document.createElement('td');
                source.textContent = item.source || 'unknown';
                const type = document.createElement('td');
                type.textContent = item.type || 'single';
                tr.appendChild(name);
                tr.appendChild(status);
                tr.appendChild(expires);
                tr.appendChild(size);
                tr.appendChild(source);
                tr.appendChild(type);
                transientTable.appendChild(tr);
            });
        };

        const renderTransientChart = () => {
            if (!transientChart || !transientChart.getContext) return;
            const ctx = transientChart.getContext('2d');
            const width = transientChart.width;
            const height = transientChart.height;
            ctx.clearRect(0, 0, width, height);
            const points = transientHistory.slice(-40);
            if (!points.length) {
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('History builds as you view pages.', 8, 16);
                return;
            }
            const max = Math.max(...points.map((p) => p.total || 0), 1);
            ctx.strokeStyle = '#22c55e';
            ctx.beginPath();
            points.forEach((p, idx) => {
                const x = (idx / Math.max(1, points.length - 1)) * (width - 10) + 5;
                const y = height - ((p.total || 0) / max) * (height - 20) - 5;
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.strokeStyle = '#fbbf24';
            ctx.beginPath();
            points.forEach((p, idx) => {
                const x = (idx / Math.max(1, points.length - 1)) * (width - 10) + 5;
                const y = height - ((p.expired || 0) / max) * (height - 20) - 5;
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        const renderTransientRecommendations = () => {
            if (!transientReco) return;
            const recs = [];
            const counts = transientsData.counts || {};
            const space = transientsData.space || {};
            if ((counts.expired || 0) > 0) {
                recs.push(`Delete ${counts.expired} expired transients to free ${space.expired_readable || 'space'}.`);
            }
            if ((counts.orphan || 0) > 0) {
                recs.push(`${counts.orphan} orphaned timeouts detected. Clean them up to reduce option table bloat.`);
            }
            if ((counts.never_used || 0) > 0) {
                recs.push(`${counts.never_used} transients created but never read in this view. Revisit creation logic or lower TTL.`);
            }
            if ((transientsData.queries?.hits || 0) > 20) {
                recs.push('High transient query volume this request. Consider longer TTL or grouping updates.');
            }
            if (!recs.length) {
                recs.push('No obvious transient issues detected.');
            }
            transientReco.innerHTML = '';
            recs.slice(0, 6).forEach((msg) => {
                const row = document.createElement('div');
                row.className = 'plugency-list-item';
                const text = document.createElement('span');
                text.className = 'plugency-source';
                text.textContent = msg;
                row.appendChild(text);
                transientReco.appendChild(row);
            });
        };

        const exportTransients = () => {
            const payload = {
                captured_at: new Date().toISOString(),
                counts: transientsData.counts || {},
                space: transientsData.space || {},
                items: transientItems.slice(0, 500),
            };
            openActionModal({
                title: 'Transient inventory',
                message: 'Copy this JSON for analysis.',
                code: JSON.stringify(payload, null, 2),
                copyLabel: 'Copy transients',
            });
        };

        const cleanupTransients = () => {
            if (!cleanupTransientsBtn) return;
            setLoading(cleanupTransientsBtn, true, 'Cleaning...');
            post('plugency_delete_expired_transients', {})
                .then((data) => {
                    setStatus(`Deleted ${data.deleted || 0} expired transients.`, 'success');
                })
                .catch((err) => setStatus(err.message, 'error'))
                .finally(() => setLoading(cleanupTransientsBtn, false));
        };

        const initTransients = () => {
            if (!transientCard) return;
            loadTransientHistory();
            transientHistory.push({
                t: Date.now(),
                total: transientsData.counts ? transientsData.counts.total : 0,
                expired: transientsData.counts ? transientsData.counts.expired : 0,
            });
            transientHistory = transientHistory.slice(-40);
            saveTransientHistory();
            renderTransientBadge();
            renderTransientSpace();
            renderTransientTable();
            renderTransientChart();
            renderTransientRecommendations();
            if (transientSearch) {
                transientSearch.addEventListener('input', renderTransientTable);
            }
            if (cleanupTransientsBtn) {
                cleanupTransientsBtn.addEventListener('click', cleanupTransients);
            }
            if (exportTransientsBtn) {
                exportTransientsBtn.addEventListener('click', exportTransients);
            }
        };

        initTransients();

        const mapUrlToPlugin = (url) => {
            if (!url) return '';
            const lower = url.toLowerCase();
            const match = lower.match(/\/wp-content\/plugins\/([^\/]+)/);
            if (match && match[1]) {
                return match[1];
            }
            return '';
        };

        const buildPluginAssets = () => {
            const plugins = new Map();
            const add = (asset) => {
                if (!asset || !asset.src) return;
                const plugin = mapUrlToPlugin(asset.src) || asset.source || '';
                if (!plugin) return;
                if (!plugins.has(plugin)) plugins.set(plugin, { plugin, scripts: [], styles: [], size: 0, duration: 0 });
                const entry = plugins.get(plugin);
                if (asset.type === 'style') entry.styles.push(asset.src); else entry.scripts.push(asset.src);
                entry.size += asset.bytes || 0;
                entry.duration += asset.fetch_ms || 0;
            };
            (snapshotData.styles || []).forEach(add);
            (snapshotData.scripts || []).forEach((s) => add({ ...s, type: 'script' }));
            return Array.from(plugins.values());
        };

        const collectConsoleErrors = () => {
            const render = () => {
                if (!pluginConsoleList) return;
                pluginConsoleList.innerHTML = '';
                if (!consoleErrors.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No console errors captured yet.';
                    row.appendChild(text);
                    pluginConsoleList.appendChild(row);
                    return;
                }
                consoleErrors.slice(-8).reverse().forEach((err) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const label = document.createElement('div');
                    label.className = 'plugency-path';
                    label.textContent = err.message || '(error)';
                    const meta = document.createElement('div');
                    meta.className = 'plugency-accordion-meta';
                    meta.textContent = `${err.plugin || 'unknown plugin'} | ${err.source || ''}`;
                    row.appendChild(label);
                    row.appendChild(meta);
                    pluginConsoleList.appendChild(row);
                });
            };
            window.addEventListener('error', (event) => {
                const plugin = mapUrlToPlugin(event.filename || '');
                consoleErrors.push({ message: event.message, source: event.filename, plugin });
                render();
            });
            window.addEventListener('unhandledrejection', (event) => {
                const reason = (event.reason && event.reason.message) ? event.reason.message : String(event.reason || 'Promise rejection');
                consoleErrors.push({ message: reason, source: '(promise)', plugin: '' });
                render();
            });
            render();
        };

        const detectCssConflicts = () => {
            const conflicts = [];
            const selectorMap = new Map();
            const sheets = Array.from(document.styleSheets || []);
            sheets.forEach((sheet) => {
                const href = sheet.href || '';
                const plugin = mapUrlToPlugin(href);
                if (!plugin) return;
                let rules;
                try {
                    rules = sheet.cssRules;
                } catch (e) {
                    return;
                }
                Array.from(rules || []).forEach((rule) => {
                    if (rule.type === CSSRule.STYLE_RULE && rule.selectorText) {
                        const sel = rule.selectorText;
                        if (!selectorMap.has(sel)) selectorMap.set(sel, new Set());
                        selectorMap.get(sel).add(plugin);
                    }
                });
            });
            selectorMap.forEach((plugins, selector) => {
                if (plugins.size > 1) {
                    conflicts.push({ selector, plugins: Array.from(plugins) });
                }
            });
            return conflicts.slice(0, 12);
        };

        const detectDuplicateLibraries = () => {
            const resources = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
            const scripts = (resources || []).filter((r) => (r.initiatorType || '').toLowerCase() === 'script');
            const nameMap = new Map();
            scripts.forEach((s) => {
                const name = (s.name || '').split('/').slice(-1)[0].split('?')[0];
                const plugin = mapUrlToPlugin(s.name || '');
                if (!name) return;
                if (!nameMap.has(name)) nameMap.set(name, []);
                nameMap.get(name).push(plugin || '(unknown)');
            });
            const dups = [];
            nameMap.forEach((plugins, name) => {
                const uniques = Array.from(new Set(plugins.filter(Boolean)));
                if (plugins.length > 1 && uniques.length > 1) {
                    dups.push({ name, plugins: uniques });
                }
            });
            return dups.slice(0, 10);
        };

        const scoreConflicts = (signals) => {
            let score = 0;
            score += (signals.errors || 0) * 15;
            score += (signals.css || 0) * 10;
            score += (signals.duplicates || 0) * 8;
            score += (signals.blocking || 0) * 6;
            return Math.min(100, score);
        };

        const renderPluginConflictUI = () => {
            if (!pluginConflictCard) return;
            const assets = buildPluginAssets();
            const duplicates = detectDuplicateLibraries();
            const cssConflicts = detectCssConflicts();
            const blocking = assets.filter((a) => a.duration > 300 || a.size > 250000);
            const warnings = [];
            if (duplicates.length) warnings.push(`${duplicates.length} duplicate libraries detected (e.g., ${duplicates[0].name}).`);
            if (cssConflicts.length) warnings.push(`${cssConflicts.length} selectors overridden by multiple plugins.`);
            if (consoleErrors.length) warnings.push(`${consoleErrors.length} console error(s) linked to plugins.`);
            if (blocking.length) warnings.push(`${blocking.length} heavy plugin assets slowing load. Consider deferring.`);
            if (!warnings.length) warnings.push('No major plugin conflicts detected.');

            if (pluginConflictWarnings) {
                pluginConflictWarnings.innerHTML = '';
                warnings.forEach((w) => {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item plugency-perf-row';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = w;
                    row.appendChild(text);
                    pluginConflictWarnings.appendChild(row);
                });
            }
            if (pluginDuplicateList) {
                pluginDuplicateList.innerHTML = '';
                if (!duplicates.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No duplicate libraries found.';
                    row.appendChild(text);
                    pluginDuplicateList.appendChild(row);
                } else {
                    duplicates.forEach((dup) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item';
                        const text = document.createElement('span');
                        text.className = 'plugency-source';
                        text.textContent = `${dup.name} loaded by ${dup.plugins.join(', ')}`;
                        row.appendChild(text);
                        pluginDuplicateList.appendChild(row);
                    });
                }
            }
            if (pluginCssConflicts) {
                pluginCssConflicts.innerHTML = '';
                if (!cssConflicts.length) {
                    const row = document.createElement('div');
                    row.className = 'plugency-list-item';
                    const text = document.createElement('span');
                    text.className = 'plugency-source';
                    text.textContent = 'No overlapping selectors detected.';
                    row.appendChild(text);
                    pluginCssConflicts.appendChild(row);
                } else {
                    cssConflicts.forEach((c) => {
                        const row = document.createElement('div');
                        row.className = 'plugency-list-item plugency-perf-row';
                        const text = document.createElement('span');
                        text.className = 'plugency-source';
                        text.textContent = `${c.selector} overridden by ${c.plugins.join(', ')}`;
                        row.appendChild(text);
                        pluginCssConflicts.appendChild(row);
                    });
                }
            }
            if (pluginMatrix) {
                const pairs = cssConflicts.slice(0, 6).map((c) => `${c.plugins.join(' x ')} (${c.selector})`);
                pluginMatrix.textContent = pairs.length ? pairs.join('\n') : 'No conflict pairs observed.';
            }
            if (pluginConflictMeta) {
                const score = scoreConflicts({
                    errors: consoleErrors.length,
                    css: cssConflicts.length,
                    duplicates: duplicates.length,
                    blocking: blocking.length,
                });
                pluginConflictMeta.textContent = `Conflict risk: ${score}/100`;
                pluginConflictMeta.className = 'plugency-badge ' + (score > 70 ? 'warn' : score > 40 ? 'warn' : 'success');
            }
        };

        const exportPluginConflicts = () => {
            const payload = {
                captured_at: new Date().toISOString(),
                console_errors: consoleErrors.slice(-20),
                duplicates: detectDuplicateLibraries(),
                css_conflicts: detectCssConflicts(),
                assets: buildPluginAssets(),
            };
            openActionModal({
                title: 'Plugin conflict report',
                message: 'Copy this JSON for debugging conflicts.',
                code: JSON.stringify(payload, null, 2),
                copyLabel: 'Copy report',
            });
        };

        collectConsoleErrors();

        const getCoverageData = () => {
            const cov = snapshotData.coverage || {};
            const aggregate = Array.isArray(cov.aggregate) ? cov.aggregate : [];
            const recent = Array.isArray(cov.recent) ? cov.recent : [];
            const unused = Array.isArray(cov.unused) ? cov.unused : [];
            return { aggregate, recent, unused };
        };

        const renderCoverageHeatmap = (data) => {
            if (!coverageHeatmap || !coverageHeatmap.getContext) return;
            const ctx = coverageHeatmap.getContext('2d');
            const width = coverageHeatmap.width;
            const height = coverageHeatmap.height;
            ctx.clearRect(0, 0, width, height);
            const items = (data.aggregate || []).slice(0, 40);
            if (!items.length) {
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('No coverage captured yet.', 8, 16);
                return;
            }
            const max = Math.max(...items.map((i) => i.count || 0), 1);
            const cellW = Math.max(20, Math.floor(width / items.length));
            items.forEach((item, idx) => {
                const intensity = (item.count || 0) / max;
                ctx.fillStyle = `rgba(34,197,94,${Math.max(0.15, intensity)})`;
                ctx.fillRect(idx * cellW, height - (intensity * height), cellW - 2, intensity * height);
            });
        };

        const renderCoverageTop = (data) => {
            if (!coverageTop) return;
            coverageTop.innerHTML = '';
            const items = (data.aggregate || []).slice(0, 10);
            if (!items.length) {
                const row = document.createElement('div');
                row.className = 'plugency-list-item';
                const text = document.createElement('span');
                text.className = 'plugency-source';
                text.textContent = 'No coverage captured yet.';
                row.appendChild(text);
                coverageTop.appendChild(row);
                return;
            }
            items.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'plugency-list-item plugency-perf-row';
                const label = document.createElement('div');
                label.className = 'plugency-path';
                label.textContent = item.function || '(function)';
                const meta = document.createElement('div');
                meta.className = 'plugency-accordion-meta';
                meta.textContent = `${item.count || 0} hits | depth ${item.max_depth || 0}`;
                row.appendChild(label);
                row.appendChild(meta);
                coverageTop.appendChild(row);
            });
        };

        const renderCoverageUnused = (data) => {
            if (!coverageUnusedList) return;
            coverageUnusedList.innerHTML = '';
            const unused = (data.unused || []).slice(0, 20);
            if (!unused.length) {
                const row = document.createElement('div');
                row.className = 'plugency-list-item';
                const text = document.createElement('span');
                text.className = 'plugency-source';
                text.textContent = 'No unused functions detected in current scope.';
                row.appendChild(text);
                coverageUnusedList.appendChild(row);
                return;
            }
            unused.forEach((fn) => {
                const row = document.createElement('div');
                row.className = 'plugency-list-item';
                const text = document.createElement('span');
                text.className = 'plugency-source';
                text.textContent = fn;
                row.appendChild(text);
                coverageUnusedList.appendChild(row);
            });
        };

        const renderCoverageMeta = (data) => {
            if (!coverageMeta) return;
            coverageMeta.textContent = `${(data.aggregate || []).length} functions tracked`;
        };

        const renderCoverageCallgraph = (data) => {
            if (!coverageCallgraph) return;
            const lines = (data.recent || []).slice(0, 20).map((row) => `${row.function} (${row.count} hits)`);
            coverageCallgraph.textContent = lines.length ? lines.join('\n') : 'No call graph captured yet.';
        };

        const exportCoverage = () => {
            const data = getCoverageData();
            openActionModal({
                title: 'Coverage export',
                message: 'Copy for external coverage tools (JSON).',
                code: JSON.stringify(data, null, 2),
                copyLabel: 'Copy coverage',
            });
        };

        const initCoverage = () => {
            if (!coverageCard) return;
            const data = getCoverageData();
            renderCoverageHeatmap(data);
            renderCoverageTop(data);
            renderCoverageUnused(data);
            renderCoverageCallgraph(data);
            renderCoverageMeta(data);
        };

        const renderApiStatus = (text, tone = 'neutral') => {
            if (apiStatus) {
                apiStatus.textContent = text;
                apiStatus.classList.remove('success', 'warn', 'error', 'neutral');
                apiStatus.classList.add(tone);
            }
        };

        const maskAuth = (headers) => {
            const masked = {};
            Object.entries(headers || {}).forEach(([k, v]) => {
                const key = k.toLowerCase();
                if (key === 'authorization' || key === 'proxy-authorization') {
                    masked[k] = '[masked]';
                } else {
                    masked[k] = v;
                }
            });
            return masked;
        };

        const formatCurl = (entry) => {
            const parts = [`curl -X ${entry.method || 'GET'} "${entry.url}"`];
            Object.entries(entry.headers || {}).forEach(([k, v]) => {
                parts.push(`  -H "${k}: ${v}"`);
            });
            if (entry.body && entry.body.length < 4000) {
                parts.push(`  --data '${entry.body}'`);
            }
            return parts.join(' \\\n');
        };

        const renderApiDetail = (entry) => {
            if (!entry || !apiDetail) {
                return;
            }
            const payload = {
                id: entry.id,
                url: entry.url,
                method: entry.method,
                status: entry.status,
                duration_ms: entry.duration,
                timings: entry.timings,
                request_headers: entry.headers,
                response_headers: entry.responseHeaders,
                request_body: entry.body,
                response_body: entry.responseBody,
                auth: entry.auth,
                curl: formatCurl(entry),
            };
            apiDetail.textContent = JSON.stringify(payload, null, 2);
            if (apiDetailBadge) {
                apiDetailBadge.textContent = `${entry.method} ${entry.status}`;
                apiDetailBadge.className = 'plugency-badge ' + (entry.status >= 400 ? 'warn' : 'success');
            }
            selectedApiId = entry.id;
            if (copyApiCurlBtn) copyApiCurlBtn.disabled = false;
            if (replayApiBtn) replayApiBtn.disabled = false;
            if (mockApiRespBtn) mockApiRespBtn.disabled = false;
        };

        const renderApiList = () => {
            if (!apiList) return;
            apiList.innerHTML = '';
            const endpointFilter = (apiFilterEndpoint && apiFilterEndpoint.value || '').toLowerCase();
            const methodFilter = (apiFilterMethod && apiFilterMethod.value || '').toLowerCase();
            const statusFilter = (apiFilterStatus && apiFilterStatus.value || '').toLowerCase();
            const latencyFilter = apiFilterLatency && apiFilterLatency.value ? parseInt(apiFilterLatency.value, 10) : 0;
            const filtered = apiLogs.filter((entry) => {
                if (endpointFilter && !entry.url.toLowerCase().includes(endpointFilter)) return false;
                if (methodFilter && (entry.method || '').toLowerCase().indexOf(methodFilter) === -1) return false;
                if (statusFilter && String(entry.status || '').indexOf(statusFilter) === -1) return false;
                if (latencyFilter && (entry.duration || 0) < latencyFilter) return false;
                return true;
            }).slice(-120).reverse();
            if (!filtered.length) {
                const row = document.createElement('div');
                row.className = 'plugency-list-item';
                const text = document.createElement('span');
                text.className = 'plugency-source';
                text.textContent = 'No API requests match the filters.';
                row.appendChild(text);
                apiList.appendChild(row);
                return;
            }
            filtered.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'plugency-list-item plugency-perf-row';
                const title = document.createElement('div');
                title.className = 'plugency-path';
                title.textContent = `${entry.method} ${entry.url}`;
                const meta = document.createElement('div');
                meta.className = 'plugency-accordion-meta';
                meta.textContent = `${entry.status || 'pending'} | ${Math.round(entry.duration || 0)} ms`;
                const pill = document.createElement('span');
                pill.className = 'plugency-pill';
                if ((entry.status || 200) >= 400) {
                    pill.classList.add('error');
                    pill.textContent = 'Fail';
                } else if ((entry.duration || 0) > 800) {
                    pill.classList.add('warn');
                    pill.textContent = 'Slow';
                } else {
                    pill.classList.add('success');
                    pill.textContent = 'OK';
                }
                row.appendChild(title);
                row.appendChild(meta);
                row.appendChild(pill);
                row.addEventListener('click', () => renderApiDetail(entry));
                apiList.appendChild(row);
            });
        };

        const renderApiWaterfall = () => {
            if (!apiWaterfall || !apiWaterfall.getContext) return;
            const ctx = apiWaterfall.getContext('2d');
            const width = apiWaterfall.width;
            const height = apiWaterfall.height;
            ctx.clearRect(0, 0, width, height);
            const items = apiLogs.slice(-30);
            if (!items.length) {
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Waiting for API traffic...', 8, 16);
                return;
            }
            const max = Math.max(...items.map((i) => i.duration || 0), 1);
            items.forEach((item, idx) => {
                const barWidth = Math.max(4, Math.floor((width - 20) / items.length));
                const x = 10 + idx * barWidth;
                const h = Math.max(4, Math.round(((item.duration || 0) / max) * (height - 20)));
                ctx.fillStyle = (item.status || 200) >= 400 ? '#f87171' : ((item.duration || 0) > 800 ? '#fbbf24' : '#22c55e');
                ctx.fillRect(x, height - h - 10, barWidth - 2, h);
            });
        };

        const exportApiLog = () => {
            const payload = {
                captured_at: new Date().toISOString(),
                logs: apiLogs.slice(-200),
            };
            const pretty = JSON.stringify(payload, null, 2);
            openActionModal({
                title: 'API log exported',
                message: 'Copy this JSON for external analysis.',
                code: pretty,
                copyLabel: 'Copy API log',
            });
        };

        const applyApiFilters = () => {
            renderApiList();
            renderApiWaterfall();
        };

        const addApiLog = (entry) => {
            apiLogs.push(entry);
            renderApiStatus(`${apiLogs.length} captured`, 'neutral');
            if (exportApiBtn) exportApiBtn.disabled = false;
            renderApiList();
            renderApiWaterfall();
        };

        const observeFetch = () => {
            if (!window.fetch) return;
            const origFetch = window.fetch.bind(window);
            window.fetch = (...args) => {
                const url = args[0] && args[0].url ? args[0].url : args[0];
                const opts = args[1] || {};
                const method = (opts.method || 'GET').toUpperCase();
                const headers = maskAuth(opts.headers || {});
                const body = typeof opts.body === 'string' ? opts.body : '';
                const id = `api_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                const start = performance.now();
                const pending = { id, url: String(url || ''), method, headers, body, status: null, duration: null, timings: {}, auth: {}, responseBody: null, responseHeaders: {}, isMock: false };
                addApiLog(pending);
                if (mockApiMode) {
                    pending.status = 200;
                    pending.duration = 1;
                    pending.responseBody = '{"mock":true}';
                    renderApiList();
                    renderApiWaterfall();
                    return Promise.resolve(new Response(pending.responseBody, { status: 200, headers: { 'Content-Type': 'application/json' } }));
                }
                return origFetch(...args).then(async (res) => {
                    const cloned = res.clone();
                    let text = '';
                    try {
                        text = await cloned.text();
                    } catch (e) {
                        text = '[unreadable body]';
                    }
                    pending.status = res.status;
                    pending.duration = performance.now() - start;
                    pending.responseBody = text;
                    pending.responseHeaders = maskAuth(Object.fromEntries(res.headers.entries()));
                    renderApiList();
                    renderApiWaterfall();
                    return res;
                }).catch((err) => {
                    pending.status = 0;
                    pending.duration = performance.now() - start;
                    pending.responseBody = String(err);
                    renderApiList();
                    renderApiWaterfall();
                    throw err;
                });
            };
        };

        const observeXHR = () => {
            if (!window.XMLHttpRequest) return;
            const OrigXHR = window.XMLHttpRequest;
            function WrappedXHR() {
                const xhr = new OrigXHR();
                let entry = null;
                let method = 'GET';
                let url = '';
                xhr.addEventListener('loadstart', () => {
                    const id = `api_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                    entry = { id, url, method, headers: {}, body: '', status: null, duration: null, responseBody: null, responseHeaders: {}, timings: {}, auth: {} };
                    entry._start = performance.now();
                    addApiLog(entry);
                });
                xhr.addEventListener('loadend', () => {
                    if (!entry) return;
                    entry.status = xhr.status;
                    entry.duration = performance.now() - (entry._start || performance.now());
                    entry.responseBody = xhr.responseText || '';
                    entry.responseHeaders = {};
                    (xhr.getAllResponseHeaders() || '').trim().split(/[\r\n]+/).forEach((line) => {
                        const parts = line.split(': ');
                        if (parts.length === 2) {
                            entry.responseHeaders[parts[0]] = parts[1];
                        }
                    });
                    renderApiList();
                    renderApiWaterfall();
                });
                const origOpen = xhr.open;
                xhr.open = function patchedOpen(m, u, async, user, pass) {
                    method = (m || 'GET').toUpperCase();
                    url = u || '';
                    return origOpen.call(xhr, m, u, async, user, pass);
                };
                const origSend = xhr.send;
                xhr.send = function patchedSend(body) {
                    if (entry) {
                        entry.body = typeof body === 'string' ? body : '';
                    }
                    return origSend.call(xhr, body);
                };
                return xhr;
            }
            window.XMLHttpRequest = WrappedXHR;
        };

        const copySelectedApiCurl = () => {
            const entry = apiLogs.find((i) => i.id === selectedApiId);
            if (!entry) return;
            copyText(formatCurl(entry), copyApiCurlBtn || undefined, 'cURL copied').catch(() => {});
        };

        const replaySelectedApi = () => {
            const entry = apiLogs.find((i) => i.id === selectedApiId);
            if (!entry || !entry.url) return;
            const body = prompt('Edit request body (optional):', entry.body || '');
            setStatus('Replaying API request...', 'info');
            fetch(entry.url, { method: entry.method || 'GET', headers: entry.headers || {}, body: body || undefined })
                .then((res) => res.text().then((txt) => ({ res, txt })))
                .then(({ res, txt }) => {
                    setStatus(`Replay status ${res.status}`, res.status >= 400 ? 'error' : 'success');
                    openActionModal({
                        title: `Replay result (${res.status})`,
                        message: 'Response body shown below.',
                        code: txt.slice(0, 4000),
                        copyLabel: 'Copy body',
                    });
                })
                .catch((err) => setStatus(err.message, 'error'));
        };

        const mockSelectedApi = () => {
            const entry = apiLogs.find((i) => i.id === selectedApiId);
            if (!entry) return;
            mockApiMode = !mockApiMode;
            if (toggleMockApiBtn) {
                toggleMockApiBtn.textContent = mockApiMode ? 'Mock on' : 'Mock off';
            }
            setStatus(mockApiMode ? 'Mock responses enabled for next calls.' : 'Mock disabled.', 'info');
        };

        if (apiSection) {
            observeFetch();
            observeXHR();
            [apiFilterEndpoint, apiFilterMethod, apiFilterStatus, apiFilterLatency].forEach((input) => {
                if (input) {
                    input.addEventListener('input', applyApiFilters);
                }
            });
            if (exportApiBtn) exportApiBtn.addEventListener('click', exportApiLog);
            if (clearApiBtn) clearApiBtn.addEventListener('click', () => { apiLogs = []; renderApiList(); renderApiWaterfall(); renderApiStatus('Cleared', 'neutral'); });
            if (toggleMockApiBtn) toggleMockApiBtn.addEventListener('click', () => { mockApiMode = !mockApiMode; toggleMockApiBtn.textContent = mockApiMode ? 'Mock on' : 'Mock off'; });
            if (copyApiCurlBtn) copyApiCurlBtn.addEventListener('click', copySelectedApiCurl);
            if (replayApiBtn) replayApiBtn.addEventListener('click', replaySelectedApi);
            if (mockApiRespBtn) mockApiRespBtn.addEventListener('click', mockSelectedApi);
            renderApiStatus('Ready', 'neutral');
        }
        if (bundleExportBtn && bundleCard) {
            bundleExportBtn.addEventListener('click', () => {
                const entries = getResourceEntries();
                const data = analyzeBundles(entries);
                exportBundleReport(data);
            });
        }
        if (exportPluginConflictsBtn && pluginConflictCard) {
            exportPluginConflictsBtn.addEventListener('click', exportPluginConflicts);
        }
        if (exportCoverageBtn && coverageCard) {
            exportCoverageBtn.addEventListener('click', exportCoverage);
        }
        if (showUnusedBtn && coverageCard) {
            showUnusedBtn.addEventListener('click', () => {
                const data = getCoverageData();
                renderCoverageUnused(data);
            });
        }
        if (thirdGovExport && thirdGovCard) {
            thirdGovExport.addEventListener('click', () => {
                const entries = getResourceEntries();
                const data = summarizeThirdParty(entries);
                exportBundleReport(analyzeBundles(entries)); // reuse export structure
                openActionModal({
                    title: 'Third-party report',
                    message: 'Copy external script inventory.',
                    code: JSON.stringify(data, null, 2),
                    copyLabel: 'Copy report',
                });
            });
        }
        if (thirdGovFacade && thirdGovCard) {
            thirdGovFacade.addEventListener('click', () => {
                setStatus('Facade suggestion: replace heavy widgets with click-to-activate placeholders.', 'info');
            });
        }
        if (a11yRunBtn && a11yCard) {
            a11yRunBtn.addEventListener('click', runA11yAudit);
        }
        if (a11yFixBtn && a11yCard) {
            a11yFixBtn.addEventListener('click', fixCommonA11y);
        }
        if (a11yExportBtn && a11yCard) {
            a11yExportBtn.addEventListener('click', exportA11yReport);
        }
        if (a11yCard) {
            runA11yAudit();
        }
        initCoverage();
        renderPluginConflictUI();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
