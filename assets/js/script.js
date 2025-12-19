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
        const copySnapshotBtn = panel ? panel.querySelector('[data-action="copy-snapshot"]') : null;
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
                    throw new Error(json && json.data ? json.data : 'Request failed');
                }
                return json.data;
            });
        };

        const togglePanel = () => {
            panel.classList.toggle('open');
        };

        const closePanel = () => {
            panel.classList.remove('open');
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
            setStatus('Refreshing debug log...', 'info');
            post('plugency_refresh_debug_log')
                .then((data) => {
                    if (data && typeof data.content !== 'undefined') {
                        debugLog.textContent = data.content;
                        setStatus('Debug log refreshed.', 'success');
                    }
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
        const toolsBar = panel.querySelector('[data-role="inspect-tools"]');

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
            });
            const title = document.createElement('div');
            title.className = 'plugency-inspect-title';
            title.textContent = info.selector || info.tag;
            const pre = document.createElement('pre');
            pre.textContent = JSON.stringify(info, null, 2);
            popup.appendChild(closeBtn);
            popup.appendChild(title);
            popup.appendChild(pre);
            document.body.appendChild(popup);

            const place = () => {
                const rect = target.getBoundingClientRect();
                const top = window.scrollY + rect.top - popup.offsetHeight - 8;
                const left = window.scrollX + rect.left;
                popup.style.top = `${Math.max(8, top)}px`;
                popup.style.left = `${left}px`;
            };
            place();
            popups.push({ node: popup, target });
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

        const setPopupsVisible = (visible) => {
            popups.forEach((p) => {
                p.node.style.display = visible ? '' : 'none';
            });
        };

        if (toolsBar) {
            const showBtn = toolsBar.querySelector('[data-action="show-popups"]');
            const hideBtn = toolsBar.querySelector('[data-action="hide-popups"]');
            const clearBtn = toolsBar.querySelector('[data-action="clear-popups"]');
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
                });
            }
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

        if (refreshLogBtn) {
            refreshLogBtn.addEventListener('click', refreshDebugLog);
        }

        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', clearDebugLog);
        }

        if (toggleDebugBtn) {
            updateDebugToggleLabel();
            toggleDebugBtn.addEventListener('click', toggleDebugLog);
        }

        if (toggleQueryBtn) {
            updateQueryToggleLabel();
            toggleQueryBtn.addEventListener('click', toggleQueryLogging);
        }
    });
})();
