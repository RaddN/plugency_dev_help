<?php
/**
 * Plugin Name: Plugency Dev Help
 * Description: Developer-first debugging surface for quick insight into the current request. Shows included PHP files, assets, requests, database queries, and lets you manage debug logging (admin only).
 * Version: 1.1.0
 * Author: Raihan Hossain
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PLUGENCY_DEV_HELP_VERSION', '1.1.0');

/**
 * Guard utility to centralize capability checks.
 */
function plugency_dev_help_can_view(): bool
{
    return is_user_logged_in() && current_user_can('manage_options');
}

function plugency_dev_help_enqueue_assets(): void
{
    if (!plugency_dev_help_can_view()) {
        return;
    }

    $version = defined('WP_DEBUG') && WP_DEBUG ? time() : PLUGENCY_DEV_HELP_VERSION;

    wp_enqueue_style(
        'plugency-dev-help',
        plugin_dir_url(__FILE__) . 'assets/css/style.css',
        array(),
        $version
    );

    wp_enqueue_script(
        'plugency-dev-help',
        plugin_dir_url(__FILE__) . 'assets/js/script.js',
        array(),
        $version,
        true
    );

    wp_localize_script(
        'plugency-dev-help',
        'plugencyDevHelp',
        array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('plugency_dev_help'),
            'debugLoggingEnabled' => (bool) (defined('WP_DEBUG') && WP_DEBUG),
            'queryLoggingEnabled' => (bool) (defined('SAVEQUERIES') && SAVEQUERIES),
        )
    );
}

add_action('wp_enqueue_scripts', 'plugency_dev_help_enqueue_assets');
add_action('admin_enqueue_scripts', 'plugency_dev_help_enqueue_assets');

/**
 * Render helper to avoid repeating escaping logic.
 */
function plugency_dev_help_print_pre($value): void
{
    echo '<pre>' . esc_html(print_r($value, true)) . '</pre>';
}

/**
 * Trim and mask sensitive data to avoid dumping secrets.
 */
function plugency_dev_help_clean_value($value, int $depth = 0)
{
    if ($depth > 4) {
        return '[depth truncated]';
    }

    if (is_array($value)) {
        $clean = array();
        foreach ($value as $key => $item) {
            $clean[$key] = plugency_dev_help_clean_value($item, $depth + 1);
        }
        return $clean;
    }

    if (is_object($value)) {
        return sprintf('[object %s]', get_class($value));
    }

    if (is_bool($value) || is_null($value) || is_numeric($value)) {
        return $value;
    }

    $string = (string) $value;
    if (strlen($string) > 500) {
        $string = substr($string, 0, 500) . '... [truncated]';
    }

    return $string;
}

function plugency_dev_help_mask_sensitive_keys(array $data): array
{
    $sensitive_keys = array('pass', 'password', 'pwd', 'token', 'secret', 'auth', 'cookie', 'key');
    $masked = array();

    foreach ($data as $key => $value) {
        $clean_value = plugency_dev_help_clean_value($value);
        foreach ($sensitive_keys as $needle) {
            if (stripos((string) $key, $needle) !== false) {
                $masked[$key] = is_scalar($clean_value) ? '[redacted]' : '[redacted array]';
                continue 2;
            }
        }
        $masked[$key] = $clean_value;
    }

    return $masked;
}

/**
 * Classify a path/URL into plugin/theme/core buckets for filtering.
 */
function plugency_dev_help_classify_path(string $path): array
{
    $original = $path;
    $site_host = wp_parse_url(home_url(), PHP_URL_HOST);

    if (filter_var($path, FILTER_VALIDATE_URL)) {
        $host = wp_parse_url($path, PHP_URL_HOST);
        if ($host && $site_host && strcasecmp((string) $host, (string) $site_host) !== 0) {
            return array(
                'category' => 'external',
                'category_label' => 'External',
                'source' => $host,
                'path' => $original,
            );
        }
        $url_path = wp_parse_url($path, PHP_URL_PATH);
        if ($url_path) {
            $path = trailingslashit(ABSPATH) . ltrim($url_path, '/');
        }
    }

    $normalized = wp_normalize_path($path);
    $abs = wp_normalize_path(ABSPATH);
    $plugins_dir = defined('WP_PLUGIN_DIR') ? wp_normalize_path(WP_PLUGIN_DIR) : $abs . 'wp-content/plugins';
    $mu_dir = defined('WPMU_PLUGIN_DIR') ? wp_normalize_path(WPMU_PLUGIN_DIR) : $abs . 'wp-content/mu-plugins';
    $themes_root = wp_normalize_path(get_theme_root());
    $stylesheet_dir = wp_normalize_path(get_stylesheet_directory());
    $template_dir = wp_normalize_path(get_template_directory());
    $wp_admin = wp_normalize_path($abs . 'wp-admin');
    $wp_includes = wp_normalize_path($abs . 'wp-includes');

    if (strpos($normalized, $wp_admin) === 0 || strpos($normalized, $wp_includes) === 0) {
        return array(
            'category' => 'core',
            'category_label' => 'Core',
            'source' => 'WordPress Core',
            'path' => $original,
        );
    }

    if (strpos($normalized, $mu_dir) === 0) {
        $relative = trim(str_replace($mu_dir, '', $normalized), '/');
        $slug = $relative ? explode('/', $relative)[0] : 'mu-plugin';
        return array(
            'category' => 'mu-plugin',
            'category_label' => 'MU Plugin',
            'source' => $slug,
            'path' => $original,
        );
    }

    if (strpos($normalized, $plugins_dir) === 0) {
        $relative = trim(str_replace($plugins_dir, '', $normalized), '/');
        $slug = $relative ? explode('/', $relative)[0] : 'plugin';
        return array(
            'category' => 'plugin',
            'category_label' => 'Plugin',
            'source' => $slug,
            'path' => $original,
        );
    }

    if (strpos($normalized, $stylesheet_dir) === 0) {
        $theme = wp_get_theme();
        return array(
            'category' => 'child-theme',
            'category_label' => 'Child Theme',
            'source' => $theme->get('Name'),
            'path' => $original,
        );
    }

    if (strpos($normalized, $template_dir) === 0) {
        $theme = wp_get_theme();
        $parent = $theme->parent() ? $theme->parent()->get('Name') : $theme->get('Name');
        return array(
            'category' => 'parent-theme',
            'category_label' => 'Parent Theme',
            'source' => $parent,
            'path' => $original,
        );
    }

    if (strpos($normalized, $themes_root) === 0) {
        return array(
            'category' => 'theme',
            'category_label' => 'Theme',
            'source' => 'Theme',
            'path' => $original,
        );
    }

    if (strpos($normalized, $abs) === 0) {
        return array(
            'category' => 'site',
            'category_label' => 'Site',
            'source' => 'Site',
            'path' => $original,
        );
    }

    return array(
        'category' => 'other',
        'category_label' => 'Other',
        'source' => '',
        'path' => $original,
    );
}

function plugency_dev_help_category_label(string $category): string
{
    $map = array(
        'core' => 'Core',
        'plugin' => 'Plugins',
        'mu-plugin' => 'MU Plugins',
        'child-theme' => 'Child Theme',
        'parent-theme' => 'Parent Theme',
        'theme' => 'Theme',
        'site' => 'Site',
        'external' => 'External',
        'other' => 'Other',
    );
    return isset($map[$category]) ? $map[$category] : ucfirst($category);
}

function plugency_dev_help_group_by_source(array $items): array
{
    $grouped = array();
    foreach ($items as $item) {
        $category = isset($item['category']) ? $item['category'] : 'other';
        $source = isset($item['source']) && $item['source'] !== '' ? $item['source'] : plugency_dev_help_category_label($category);
        if (!isset($grouped[$category])) {
            $grouped[$category] = array();
        }
        if (!isset($grouped[$category][$source])) {
            $grouped[$category][$source] = array();
        }
        $grouped[$category][$source][] = $item;
    }
    return $grouped;
}

function plugency_dev_help_provenance_map(array $replace = null): array
{
    static $map = array();
    if (is_array($replace)) {
        $map = $replace;
    }
    return $map;
}

function plugency_dev_help_add_provenance(array $meta): string
{
    static $counter = 0;
    $counter++;
    $id = 'p' . $counter;
    $meta['id'] = $id;
    $meta['recorded_at'] = microtime(true);

    $map = plugency_dev_help_provenance_map();
    $map[$id] = $meta;
    plugency_dev_help_provenance_map($map);

    return $id;
}

function plugency_dev_help_wrap_with_provenance(string $html, array $meta): string
{
    if (trim($html) === '') {
        return $html;
    }
    $id = plugency_dev_help_add_provenance($meta);
    return '<span data-plugency-prov="' . esc_attr($id) . '" style="display:contents">' . $html . '</span>';
}

function plugency_dev_help_trace_file(): string
{
    $trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 12);
    $abs = wp_normalize_path(ABSPATH);
    foreach ($trace as $frame) {
        if (empty($frame['file'])) {
            continue;
        }
        $file = wp_normalize_path($frame['file']);
        if (strpos($file, $abs) === 0) {
            return $file;
        }
    }
    return '';
}

function plugency_dev_help_wrap_block(string $block_content, array $block): string
{
    if (trim($block_content) === '') {
        return $block_content;
    }
    $file = plugency_dev_help_trace_file();
    $file_meta = plugency_dev_help_classify_path($file);

    $meta = array(
        'type' => 'block',
        'name' => isset($block['blockName']) ? $block['blockName'] : '',
        'attrs' => isset($block['attrs']) ? $block['attrs'] : array(),
        'file' => $file,
        'file_category' => $file_meta['category'],
        'file_source' => $file_meta['source'],
    );

    return plugency_dev_help_wrap_with_provenance($block_content, $meta);
}

function plugency_dev_help_wrap_content(string $content): string
{
    if (trim($content) === '') {
        return $content;
    }
    global $post;
    $file = plugency_dev_help_trace_file();
    $file_meta = plugency_dev_help_classify_path($file);

    $meta = array(
        'type' => 'content',
        'post_id' => isset($post->ID) ? $post->ID : null,
        'post_type' => isset($post->post_type) ? $post->post_type : null,
        'file' => $file,
        'file_category' => $file_meta['category'],
        'file_source' => $file_meta['source'],
        'db_table' => isset($post->post_type) ? $GLOBALS['wpdb']->posts : null,
        'db_key' => isset($post->ID) ? 'ID=' . $post->ID : '',
    );

    return plugency_dev_help_wrap_with_provenance($content, $meta);
}

function plugency_dev_help_get_active_plugins(): array
{
    if (!function_exists('get_plugin_data')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }

    $active = (array) get_option('active_plugins', array());
    $plugins = array();

    foreach ($active as $plugin_file) {
        $path = WP_PLUGIN_DIR . '/' . $plugin_file;
        if (!file_exists($path)) {
            continue;
        }
        $data = get_plugin_data($path, false, false);
        $plugins[] = array(
            'name' => isset($data['Name']) ? $data['Name'] : $plugin_file,
            'version' => isset($data['Version']) ? $data['Version'] : '',
            'plugin_file' => $plugin_file,
            'path' => $path,
            'category' => 'plugin',
            'source' => isset($data['Name']) ? $data['Name'] : $plugin_file,
        );
    }

    return $plugins;
}

function plugency_dev_help_get_mu_plugins(): array
{
    if (!function_exists('get_mu_plugins')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }

    $mu_plugins = array();
    $mu = function_exists('get_mu_plugins') ? get_mu_plugins() : array();

    foreach ($mu as $plugin_file => $data) {
        $mu_plugins[] = array(
            'name' => isset($data['Name']) ? $data['Name'] : $plugin_file,
            'version' => isset($data['Version']) ? $data['Version'] : '',
            'plugin_file' => $plugin_file,
            'path' => WPMU_PLUGIN_DIR . '/' . $plugin_file,
            'category' => 'mu-plugin',
            'source' => isset($data['Name']) ? $data['Name'] : $plugin_file,
        );
    }

    return $mu_plugins;
}

function plugency_dev_help_get_cron_events(int $limit = 15): array
{
    if (!function_exists('_get_cron_array')) {
        return array();
    }

    $crons = _get_cron_array();
    $events = array();

    foreach ($crons as $timestamp => $hooks) {
        foreach ($hooks as $hook => $instances) {
            foreach ($instances as $sig => $data) {
                $events[] = array(
                    'hook' => $hook,
                    'schedule' => isset($data['schedule']) ? $data['schedule'] : 'one-off',
                    'args' => isset($data['args']) ? $data['args'] : array(),
                    'timestamp' => (int) $timestamp,
                    'time_utc' => gmdate('Y-m-d H:i:s', (int) $timestamp),
                    'in_seconds' => max(0, (int) $timestamp - time()),
                );
            }
        }
    }

    usort($events, static function ($a, $b) {
        return $a['timestamp'] <=> $b['timestamp'];
    });

    return array_slice($events, 0, $limit);
}

function plugency_dev_help_get_template_info(): array
{
    global $template, $wp_query, $wp;

    $template_path = isset($template) ? wp_normalize_path($template) : '';
    $details = plugency_dev_help_classify_path($template_path ?: '');

    return array(
        'template' => $template_path,
        'template_category' => $details['category'],
        'template_source' => $details['source'],
        'request' => isset($wp->request) ? $wp->request : '',
        'matched_rule' => isset($wp->matched_rule) ? $wp->matched_rule : '',
        'matched_query' => isset($wp->matched_query) ? $wp->matched_query : '',
        'is_main_query' => isset($wp_query) ? $wp_query->is_main_query() : null,
        'is_front_page' => isset($wp_query) ? $wp_query->is_front_page() : null,
        'is_home' => isset($wp_query) ? $wp_query->is_home() : null,
        'is_singular' => isset($wp_query) ? $wp_query->is_singular() : null,
        'queried_object' => isset($wp_query) ? plugency_dev_help_clean_value($wp_query->get_queried_object()) : null,
    );
}

function plugency_dev_help_flags(): array
{
    return array(
        'WP_DEBUG' => defined('WP_DEBUG') ? (WP_DEBUG ? 'true' : 'false') : 'not set',
        'SCRIPT_DEBUG' => defined('SCRIPT_DEBUG') ? (SCRIPT_DEBUG ? 'true' : 'false') : 'not set',
        'SAVEQUERIES' => defined('SAVEQUERIES') ? (SAVEQUERIES ? 'true' : 'false') : 'not set',
        'WP_ENVIRONMENT_TYPE' => function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'unknown',
        'DISALLOW_FILE_MODS' => defined('DISALLOW_FILE_MODS') ? (DISALLOW_FILE_MODS ? 'true' : 'false') : 'not set',
    );
}

function plugency_dev_help_get_request_headers(): array
{
    $headers = array();
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
    } else {
        foreach ($_SERVER as $key => $value) {
            if (strpos($key, 'HTTP_') === 0) {
                $header = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$header] = $value;
            }
        }
    }
    return plugency_dev_help_clean_value($headers);
}

function plugency_dev_help_get_request_data(): array
{
    return array(
        'GET' => plugency_dev_help_mask_sensitive_keys($_GET),
        'POST' => plugency_dev_help_mask_sensitive_keys($_POST),
        'COOKIE' => plugency_dev_help_mask_sensitive_keys($_COOKIE),
        'SERVER' => plugency_dev_help_clean_value($_SERVER),
        'FILES' => plugency_dev_help_clean_value($_FILES),
        'REQUEST' => plugency_dev_help_mask_sensitive_keys($_REQUEST),
        'SESSION' => isset($_SESSION) ? plugency_dev_help_clean_value($_SESSION) : array(),
        'ENV' => plugency_dev_help_clean_value($_ENV),
        'HEADERS' => plugency_dev_help_get_request_headers(),
    );
}

function plugency_dev_help_get_debug_log(int $max_lines = 250): array
{
    $path = trailingslashit(WP_CONTENT_DIR) . 'debug.log';

    if (!file_exists($path)) {
        return array(
            'path' => $path,
            'status' => 'missing',
            'content' => 'Debug log not found.',
            'size' => 0,
            'lines' => 0,
        );
    }

    if (!is_readable($path)) {
        return array(
            'path' => $path,
            'status' => 'unreadable',
            'content' => 'Debug log exists but is not readable.',
            'size' => filesize($path),
            'lines' => 0,
        );
    }

    $lines = @file($path, FILE_IGNORE_NEW_LINES);
    $lines = is_array($lines) ? $lines : array();
    $tail = array_slice($lines, -1 * $max_lines);

    return array(
        'path' => $path,
        'status' => 'ok',
        'content' => implode("\n", $tail),
        'size' => filesize($path),
        'lines' => count($lines),
    );
}

function plugency_dev_help_get_assets(): array
{
    global $wp_styles, $wp_scripts;

    $styles = array();
    $scripts = array();

    if (isset($wp_styles) && class_exists('WP_Styles') && $wp_styles instanceof WP_Styles) {
        foreach ($wp_styles->queue as $handle) {
            $details = plugency_dev_help_classify_path(isset($wp_styles->registered[$handle]->src) ? $wp_styles->registered[$handle]->src : '');
            $styles[] = array(
                'handle' => $handle,
                'src' => isset($wp_styles->registered[$handle]->src) ? $wp_styles->registered[$handle]->src : '',
                'category' => $details['category'],
                'category_label' => $details['category_label'],
                'source' => $details['source'],
            );
        }
    }

    if (isset($wp_scripts) && class_exists('WP_Scripts') && $wp_scripts instanceof WP_Scripts) {
        foreach ($wp_scripts->queue as $handle) {
            $details = plugency_dev_help_classify_path(isset($wp_scripts->registered[$handle]->src) ? $wp_scripts->registered[$handle]->src : '');
            $scripts[] = array(
                'handle' => $handle,
                'src' => isset($wp_scripts->registered[$handle]->src) ? $wp_scripts->registered[$handle]->src : '',
                'category' => $details['category'],
                'category_label' => $details['category_label'],
                'source' => $details['source'],
            );
        }
    }

    return array($styles, $scripts);
}

function plugency_dev_help_get_queries(): array
{
    global $wpdb;

    if (!defined('SAVEQUERIES') || !SAVEQUERIES || !isset($wpdb->queries) || !is_array($wpdb->queries)) {
        return array();
    }

    return array_map(
        static function ($query) {
            return array(
                'sql' => isset($query[0]) ? $query[0] : '',
                'time' => isset($query[1]) ? (float) $query[1] : 0,
                'caller' => isset($query[2]) ? $query[2] : '',
            );
        },
        $wpdb->queries
    );
}

function plugency_dev_help_query_insights(array $queries): array
{
    if (empty($queries)) {
        return array(
            'total' => 0,
            'time' => 0,
            'slowest' => array(),
        );
    }

    usort($queries, static function ($a, $b) {
        return $b['time'] <=> $a['time'];
    });

    $total_time = array_sum(array_column($queries, 'time'));

    return array(
        'total' => count($queries),
        'time' => $total_time,
        'slowest' => array_slice($queries, 0, 5),
    );
}

function plugency_dev_help_get_runtime_summary(array $included, array $styles, array $scripts, array $queries, array $requests): array
{
    $theme = wp_get_theme();

    return array(
        'wordpress' => array(
            'version' => get_bloginfo('version'),
            'environment' => function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'unknown',
            'site' => home_url(),
            'theme' => $theme->get('Name') . ' ' . $theme->get('Version'),
            'multisite' => is_multisite() ? 'Yes' : 'No',
        ),
        'php' => array(
            'version' => PHP_VERSION,
            'memory_limit' => ini_get('memory_limit'),
            'max_execution' => ini_get('max_execution_time') . 's',
            'peak_memory' => size_format(memory_get_peak_usage(true)),
        ),
        'request' => array(
            'url' => (isset($_SERVER['HTTP_HOST'], $_SERVER['REQUEST_URI'])) ? esc_url_raw((is_ssl() ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']) : '',
            'method' => isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '',
            'user' => wp_get_current_user()->user_login,
        ),
        'counts' => array(
            'php_files' => count($included),
            'styles' => count($styles),
            'scripts' => count($scripts),
            'queries' => count($queries),
            'request_entries' => array_sum(array_map('count', $requests)),
        ),
    );
}

function plugency_dev_help_group_paths(array $paths): array
{
    $buckets = array(
        'core' => array(),
        'plugin' => array(),
        'mu-plugin' => array(),
        'child-theme' => array(),
        'parent-theme' => array(),
        'theme' => array(),
        'site' => array(),
        'external' => array(),
        'other' => array(),
    );

    foreach ($paths as $path) {
        $details = plugency_dev_help_classify_path((string) $path);
        $bucket = isset($buckets[$details['category']]) ? $details['category'] : 'other';
        $buckets[$bucket][] = array(
            'path' => $details['path'],
            'source' => $details['source'],
            'category' => $details['category'],
            'category_label' => $details['category_label'],
        );
    }

    return $buckets;
}

function plugency_dev_help_snapshot(): array
{
    $included_files = get_included_files();
    list($styles, $scripts) = plugency_dev_help_get_assets();
    $requests = plugency_dev_help_get_request_data();
    $queries = plugency_dev_help_get_queries();
    $debug_log = plugency_dev_help_get_debug_log();
    $insights = plugency_dev_help_query_insights($queries);
    $summary = plugency_dev_help_get_runtime_summary($included_files, $styles, $scripts, $queries, $requests);
    $grouped_files = plugency_dev_help_group_paths($included_files);
    $all_file_items = array();
    foreach ($grouped_files as $cat_items) {
        $all_file_items = array_merge($all_file_items, $cat_items);
    }
    $files_by_source = plugency_dev_help_group_by_source($all_file_items);
    $styles_by_source = plugency_dev_help_group_by_source($styles);
    $scripts_by_source = plugency_dev_help_group_by_source($scripts);
    $active_plugins = plugency_dev_help_get_active_plugins();
    $mu_plugins = plugency_dev_help_get_mu_plugins();
    $cron_events = plugency_dev_help_get_cron_events();
    $template_info = plugency_dev_help_get_template_info();
    $flags = plugency_dev_help_flags();

    return array(
        'summary' => $summary,
        'included_files' => $included_files,
        'files_grouped' => $grouped_files,
        'files_by_source' => $files_by_source,
        'styles' => $styles,
        'styles_by_source' => $styles_by_source,
        'scripts' => $scripts,
        'scripts_by_source' => $scripts_by_source,
        'requests' => $requests,
        'queries' => $queries,
        'insights' => $insights,
        'debug_log' => $debug_log,
        'debug_enabled' => defined('WP_DEBUG') && WP_DEBUG,
        'savequeries_enabled' => defined('SAVEQUERIES') && SAVEQUERIES,
        'context' => array(
            'template' => $template_info,
            'flags' => $flags,
            'plugins' => $active_plugins,
            'mu_plugins' => $mu_plugins,
            'cron' => $cron_events,
        ),
        'provenance' => plugency_dev_help_provenance_map(),
    );
}

function plugency_dev_help_render(): void
{
    if (!plugency_dev_help_can_view()) {
        return;
    }

    $snapshot = plugency_dev_help_snapshot();
    $debug_log = $snapshot['debug_log'];
    $insights = $snapshot['insights'];
    $category_order = array('core', 'child-theme', 'parent-theme', 'theme', 'plugin', 'mu-plugin', 'external', 'site', 'other');
    $filter_sources = array();
    foreach (array('files_by_source', 'styles_by_source', 'scripts_by_source') as $bucket) {
        if (!isset($snapshot[$bucket]) || !is_array($snapshot[$bucket])) {
            continue;
        }
        foreach ($snapshot[$bucket] as $category => $sources) {
            foreach ($sources as $source => $_items) {
                if (!isset($filter_sources[$category])) {
                    $filter_sources[$category] = array();
                }
                $filter_sources[$category][$source] = true;
            }
        }
    }
    ?>
    <div class="plugency-debug-launcher" id="plugencyDebugLauncher" title="Open Plugency Debugger">DBG</div>

    <div class="plugency-debug-panel" id="plugencyDebugPanel" aria-label="Plugency Developer Debugger">
        <div class="plugency-debug-header">
            <div class="plugency-header-left">
                <button type="button" class="plugency-button ghost icon" data-action="start-inspect" title="Select element to inspect">Inspect</button>
                <div>
                    <h2>Developer Debugger</h2>
                    <p>Focused snapshot of this request. Visible to administrators only.</p>
                </div>
            </div>
            <div class="plugency-debug-actions">
                <button type="button" class="plugency-button ghost" data-action="copy-snapshot">Copy JSON Snapshot</button>
                <button type="button" class="plugency-button ghost icon" data-action="open-filter" title="Filter view">Filter</button>
                <button type="button" class="plugency-button solid" data-action="close-panel">Close</button>
            </div>
        </div>

        <div class="plugency-filter-panel" data-role="filter-panel">
            <div class="plugency-filter-panel-inner">
                <div class="plugency-filter-panel-header">
                    <div>
                        <h3>Filter view</h3>
                        <p>Select categories and sources to focus on specific plugins, themes, or core assets.</p>
                    </div>
                    <button type="button" class="plugency-button ghost" data-action="close-filter">Close</button>
                </div>
                <div class="plugency-filter-grid">
                    <?php foreach ($category_order as $category_key) : ?>
                        <?php if (empty($filter_sources[$category_key])) { continue; } ?>
                        <div class="plugency-filter-group" data-category="<?php echo esc_attr($category_key); ?>">
                            <div class="plugency-filter-title"><?php echo esc_html(plugency_dev_help_category_label($category_key)); ?></div>
                            <div class="plugency-filter-options">
                                <?php foreach (array_keys($filter_sources[$category_key]) as $source) : ?>
                                    <label class="plugency-filter-option">
                                        <input type="checkbox" data-filter-category="<?php echo esc_attr($category_key); ?>" data-filter-source="<?php echo esc_attr($source); ?>">
                                        <span><?php echo esc_html($source); ?></span>
                                    </label>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
                <div class="plugency-filter-actions">
                    <button type="button" class="plugency-button ghost" data-action="clear-filter">Clear</button>
                    <button type="button" class="plugency-button solid" data-action="apply-filter">Apply filter</button>
                </div>
            </div>
        </div>

        <div class="plugency-debug-tabs" role="tablist">
            <button class="active" data-tab="summary" role="tab" aria-selected="true">Summary</button>
            <button data-tab="files" role="tab" aria-selected="false">PHP Files</button>
            <button data-tab="assets" role="tab" aria-selected="false">Assets</button>
            <button data-tab="requests" role="tab" aria-selected="false">Requests</button>
            <button data-tab="context" role="tab" aria-selected="false">Context</button>
            <button data-tab="database" role="tab" aria-selected="false">Database</button>
            <button data-tab="logs" role="tab" aria-selected="false">Logs</button>
        </div>

        <div class="plugency-debug-body">
            <div class="plugency-section active" data-section="summary">
                <div class="plugency-grid">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Runtime</h3>
                            <span class="plugency-badge"><?php echo esc_html($snapshot['summary']['wordpress']['environment']); ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>WordPress</span><strong><?php echo esc_html($snapshot['summary']['wordpress']['version']); ?></strong></li>
                            <li><span>Theme</span><strong><?php echo esc_html($snapshot['summary']['wordpress']['theme']); ?></strong></li>
                            <li><span>Site</span><strong><?php echo esc_html($snapshot['summary']['wordpress']['site']); ?></strong></li>
                            <li><span>Multisite</span><strong><?php echo esc_html($snapshot['summary']['wordpress']['multisite']); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>PHP</h3>
                            <span class="plugency-badge neutral">Runtime</span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>PHP</span><strong><?php echo esc_html($snapshot['summary']['php']['version']); ?></strong></li>
                            <li><span>Memory limit</span><strong><?php echo esc_html($snapshot['summary']['php']['memory_limit']); ?></strong></li>
                            <li><span>Max execution</span><strong><?php echo esc_html($snapshot['summary']['php']['max_execution']); ?></strong></li>
                            <li><span>Peak usage</span><strong><?php echo esc_html($snapshot['summary']['php']['peak_memory']); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Request</h3>
                            <span class="plugency-badge <?php echo is_admin() ? 'warn' : 'neutral'; ?>"><?php echo is_admin() ? 'Admin' : 'Front-end'; ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>URL</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['request']['url']); ?>"><?php echo esc_html($snapshot['summary']['request']['url']); ?></strong></li>
                            <li><span>Method</span><strong><?php echo esc_html($snapshot['summary']['request']['method']); ?></strong></li>
                            <li><span>User</span><strong><?php echo esc_html($snapshot['summary']['request']['user']); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Counts</h3>
                            <span class="plugency-badge neutral">Totals</span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>Included files</span><strong><?php echo esc_html($snapshot['summary']['counts']['php_files']); ?></strong></li>
                            <li><span>Styles</span><strong><?php echo esc_html($snapshot['summary']['counts']['styles']); ?></strong></li>
                            <li><span>Scripts</span><strong><?php echo esc_html($snapshot['summary']['counts']['scripts']); ?></strong></li>
                            <li><span>Queries</span><strong><?php echo esc_html($snapshot['summary']['counts']['queries']); ?></strong></li>
                            <li><span>Request entries</span><strong><?php echo esc_html($snapshot['summary']['counts']['request_entries']); ?></strong></li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="files">
                <?php $category_order = array('core', 'child-theme', 'parent-theme', 'theme', 'plugin', 'mu-plugin', 'external', 'site', 'other'); ?>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Included PHP Files</h3>
                        <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyIncludedFiles">Copy</button>
                    </div>
                    <div id="plugencyIncludedFiles" class="plugency-grouped-list" data-list-scope="files">
                        <?php foreach ($category_order as $category_key) : ?>
                            <?php if (empty($snapshot['files_by_source'][$category_key])) { continue; } ?>
                            <div class="plugency-group" data-category="<?php echo esc_attr($category_key); ?>">
                                <div class="plugency-group-title"><?php echo esc_html(plugency_dev_help_category_label($category_key)); ?></div>
                                    <?php foreach ($snapshot['files_by_source'][$category_key] as $source => $items) : ?>
                                        <div class="plugency-group-source"><?php echo esc_html($source); ?></div>
                                        <div class="plugency-list">
                                            <?php foreach ($items as $item) : ?>
                                                <div class="plugency-list-item" data-category="<?php echo esc_attr($category_key); ?>" data-source="<?php echo esc_attr($source); ?>">
                                                    <span class="plugency-path"><?php echo esc_html($item['path']); ?></span>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endforeach; ?>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="assets">
                <div class="plugency-grid two">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Styles</h3>
                            <span class="plugency-badge neutral"><?php echo esc_html(count($snapshot['styles'])); ?> enqueued</span>
                        </div>
                        <div id="plugencyStyles" class="plugency-grouped-list" data-list-scope="styles">
                            <?php foreach ($category_order as $category_key) : ?>
                                <?php if (empty($snapshot['styles_by_source'][$category_key])) { continue; } ?>
                                <div class="plugency-group" data-category="<?php echo esc_attr($category_key); ?>">
                                    <div class="plugency-group-title"><?php echo esc_html(plugency_dev_help_category_label($category_key)); ?></div>
                                    <?php foreach ($snapshot['styles_by_source'][$category_key] as $source => $items) : ?>
                                        <div class="plugency-group-source"><?php echo esc_html($source); ?></div>
                                        <div class="plugency-list">
                                            <?php foreach ($items as $style) : ?>
                                                <div class="plugency-list-item" data-category="<?php echo esc_attr($category_key); ?>" data-source="<?php echo esc_attr($source); ?>">
                                                    <span class="plugency-path"><?php echo esc_html($style['handle']); ?></span>
                                                    <?php if (!empty($style['src'])) : ?>
                                                        <span class="plugency-source"><?php echo esc_html($style['src']); ?></span>
                                                    <?php endif; ?>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Scripts</h3>
                            <span class="plugency-badge neutral"><?php echo esc_html(count($snapshot['scripts'])); ?> enqueued</span>
                        </div>
                        <div id="plugencyScripts" class="plugency-grouped-list" data-list-scope="scripts">
                            <?php foreach ($category_order as $category_key) : ?>
                                <?php if (empty($snapshot['scripts_by_source'][$category_key])) { continue; } ?>
                                <div class="plugency-group" data-category="<?php echo esc_attr($category_key); ?>">
                                    <div class="plugency-group-title"><?php echo esc_html(plugency_dev_help_category_label($category_key)); ?></div>
                                    <?php foreach ($snapshot['scripts_by_source'][$category_key] as $source => $items) : ?>
                                        <div class="plugency-group-source"><?php echo esc_html($source); ?></div>
                                        <div class="plugency-list">
                                            <?php foreach ($items as $script) : ?>
                                                <div class="plugency-list-item" data-category="<?php echo esc_attr($category_key); ?>" data-source="<?php echo esc_attr($source); ?>">
                                                    <span class="plugency-path"><?php echo esc_html($script['handle']); ?></span>
                                                    <?php if (!empty($script['src'])) : ?>
                                                        <span class="plugency-source"><?php echo esc_html($script['src']); ?></span>
                                                    <?php endif; ?>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="requests">
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Request Data</h3>
                        <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyRequests">Copy</button>
                    </div>
                    <div id="plugencyRequests" class="plugency-pre">
                        <?php plugency_dev_help_print_pre($snapshot['requests']); ?>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="context">
                <div class="plugency-grid two">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Template & Query</h3>
                        </div>
                        <div class="plugency-pre">
                            <?php plugency_dev_help_print_pre($snapshot['context']['template']); ?>
                        </div>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Flags</h3>
                        </div>
                        <div class="plugency-pre">
                            <?php plugency_dev_help_print_pre($snapshot['context']['flags']); ?>
                        </div>
                    </div>
                </div>
                <div class="plugency-grid two">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Active Plugins</h3>
                        </div>
                        <div class="plugency-pre">
                            <?php plugency_dev_help_print_pre($snapshot['context']['plugins']); ?>
                        </div>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>MU Plugins</h3>
                        </div>
                        <div class="plugency-pre">
                            <?php plugency_dev_help_print_pre($snapshot['context']['mu_plugins']); ?>
                        </div>
                    </div>
                </div>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Cron (next events)</h3>
                    </div>
                    <div class="plugency-pre">
                        <?php plugency_dev_help_print_pre($snapshot['context']['cron']); ?>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="database">
                <div class="plugency-grid two">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Query Insights</h3>
                            <span class="plugency-badge <?php echo $snapshot['savequeries_enabled'] ? 'success' : 'warn'; ?>"><?php echo $snapshot['savequeries_enabled'] ? 'Logging on' : 'Logging off'; ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>Total</span><strong><?php echo esc_html($insights['total']); ?></strong></li>
                            <li><span>Total time</span><strong><?php echo esc_html(number_format_i18n($insights['time'], 4)); ?>s</strong></li>
                        </ul>
                        <h4>Slowest queries</h4>
                        <div class="plugency-pre">
                            <?php plugency_dev_help_print_pre($insights['slowest']); ?>
                        </div>
                        <div class="plugency-inline-actions">
                            <button class="plugency-button ghost" data-action="toggle-query-log"><?php echo defined('SAVEQUERIES') && SAVEQUERIES ? 'Disable query logging' : 'Enable query logging'; ?></button>
                            <span class="plugency-hint">Requires writable wp-config.php</span>
                        </div>
                        <p id="queryToggleMsg" class="plugency-status"></p>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>All Queries</h3>
                            <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyQueries">Copy</button>
                        </div>
                        <div id="plugencyQueries" class="plugency-pre">
                            <?php plugency_dev_help_print_pre($snapshot['queries']); ?>
                        </div>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="logs">
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Debug Log</h3>
                        <span class="plugency-badge neutral"><?php echo esc_html($debug_log['status']); ?></span>
                    </div>
                    <div class="plugency-log-actions">
                        <button class="plugency-button ghost" data-action="refresh-log">Refresh</button>
                        <button class="plugency-button ghost" data-action="clear-log">Clear</button>
                        <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyDebugLog">Copy</button>
                        <button class="plugency-button ghost" data-action="toggle-debug"><?php echo $snapshot['debug_enabled'] ? 'Disable debug logging' : 'Enable debug logging'; ?></button>
                    </div>
                    <p class="plugency-small">
                        Path: <?php echo esc_html($debug_log['path']); ?> |
                        Size: <?php echo esc_html(size_format((float) $debug_log['size'])); ?> |
                        Lines: <?php echo esc_html($debug_log['lines']); ?>
                    </p>
                    <div id="plugencyDebugLog" class="plugency-pre" data-role="debug-log">
                        <pre><?php echo esc_html($debug_log['content']); ?></pre>
                    </div>
                    <p id="debugLogStatus" class="plugency-status"></p>
                </div>
            </div>
        </div>
        <p class="plugency-feedback" data-role="status"></p>
        <div class="plugency-inspect-tools" data-role="inspect-tools">
            <span class="plugency-small">Element inspector</span>
            <div class="plugency-inline-actions">
                <button class="plugency-button ghost" data-action="show-popups">Show</button>
                <button class="plugency-button ghost" data-action="hide-popups">Hide</button>
                <button class="plugency-button ghost" data-action="clear-popups">Clear</button>
            </div>
        </div>
    </div>

    <script id="plugencyDebugSnapshot" type="application/json"><?php echo wp_json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES); ?></script>
    <?php
}

add_action('wp_footer', 'plugency_dev_help_render');
add_action('admin_footer', 'plugency_dev_help_render');

function plugency_dev_help_update_constant(string $content, string $constant, bool $enabled): string
{
    $pattern = "/define\\(\\s*['\"]{$constant}['\"]\\s*,\\s*(true|false)\\s*\\)\\s*;/i";
    $replacement = "define('{$constant}', " . ($enabled ? 'true' : 'false') . ');';

    if (preg_match($pattern, $content)) {
        return preg_replace($pattern, $replacement, $content);
    }

    return preg_replace('/(<\?php)/', "$1\n{$replacement}", $content, 1);
}

function plugency_toggle_query_logging(bool $enable): string
{
    $wp_config_path = ABSPATH . 'wp-config.php';

    if (!is_writable($wp_config_path)) {
        return 'Error: wp-config.php is not writable.';
    }

    $config_content = file_get_contents($wp_config_path);
    $updated_content = plugency_dev_help_update_constant($config_content, 'SAVEQUERIES', $enable);

    file_put_contents($wp_config_path, $updated_content);

    return $enable ? 'Query logging enabled.' : 'Query logging disabled.';
}

function plugency_dev_help_verify_ajax(): void
{
    if (!plugency_dev_help_can_view()) {
        wp_send_json_error('Unauthorized', 403);
    }

    check_ajax_referer('plugency_dev_help', 'nonce');
}

function plugency_toggle_query_logging_ajax(): void
{
    plugency_dev_help_verify_ajax();

    $status = isset($_POST['status']) ? sanitize_text_field(wp_unslash($_POST['status'])) : 'off';
    $message = plugency_toggle_query_logging($status === 'on');

    if (stripos($message, 'Error:') === 0) {
        wp_send_json_error($message, 500);
    }

    wp_send_json_success(
        array(
            'message' => $message,
            'enabled' => $status === 'on',
        )
    );
}

add_action('wp_ajax_toggle_query_logging', 'plugency_toggle_query_logging_ajax');

function plugency_dev_help_toggle_debug_mode(bool $enable): string
{
    $wp_config_path = ABSPATH . 'wp-config.php';
    if (!is_writable($wp_config_path)) {
        return 'Error: wp-config.php is not writable.';
    }

    $config_content = file_get_contents($wp_config_path);
    $config_content = preg_replace('/@ini_set\\(\\s*[\'"]display_errors[\'"]\\s*,\\s*0\\s*\\)\\s*;\\s*/i', '', $config_content);
    $config_content = plugency_dev_help_update_constant($config_content, 'WP_DEBUG', $enable);
    $config_content = plugency_dev_help_update_constant($config_content, 'WP_DEBUG_LOG', $enable);
    $config_content = plugency_dev_help_update_constant($config_content, 'WP_DEBUG_DISPLAY', false);

    file_put_contents($wp_config_path, $config_content);

    return $enable ? 'Debug logging enabled.' : 'Debug logging disabled.';
}

function toggle_debug_log(): void
{
    plugency_dev_help_verify_ajax();

    $status = isset($_POST['status']) ? sanitize_text_field(wp_unslash($_POST['status'])) : 'off';
    $message = plugency_dev_help_toggle_debug_mode($status === 'on');

    if (stripos($message, 'Error:') === 0) {
        wp_send_json_error($message, 500);
    }

    wp_send_json_success(
        array(
            'message' => $message,
            'enabled' => $status === 'on',
        )
    );
}

add_action('wp_ajax_toggle_debug_log', 'toggle_debug_log');

function delete_debug_file(): void
{
    plugency_dev_help_verify_ajax();

    $debug_file_path = trailingslashit(WP_CONTENT_DIR) . 'debug.log';

    if (!file_exists($debug_file_path)) {
        wp_send_json_error('Debug file not found.');
    }

    if (!is_writable($debug_file_path)) {
        wp_send_json_error('Debug file is not writable.');
    }

    unlink($debug_file_path);

    wp_send_json_success('Debug file cleared.');
}

add_action('wp_ajax_delete_debug_file', 'delete_debug_file');

function plugency_dev_help_refresh_debug_log_ajax(): void
{
    plugency_dev_help_verify_ajax();
    wp_send_json_success(plugency_dev_help_get_debug_log());
}

add_action('wp_ajax_plugency_refresh_debug_log', 'plugency_dev_help_refresh_debug_log_ajax');

add_filter('render_block', 'plugency_dev_help_wrap_block', 20, 2);
add_filter('the_content', 'plugency_dev_help_wrap_content', 20, 1);
