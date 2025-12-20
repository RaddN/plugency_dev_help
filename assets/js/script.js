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
