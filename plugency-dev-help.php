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

add_action('init', static function () {
    if (plugency_dev_help_can_view()) {
        add_action('all', 'plugency_dev_help_register_hook_trace', 1, 1);
    }
});

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

function plugency_dev_help_asset_meta(string $src): array
{
    static $cache = array();
    if (isset($cache[$src])) {
        return $cache[$src];
    }

    $bytes = null;
    $size_source = '';
    $start = microtime(true);

    if ($src !== '') {
        $parsed = wp_parse_url($src);
        $path = '';
        if (empty($parsed['host'])) {
            $path = trailingslashit(ABSPATH) . ltrim(isset($parsed['path']) ? $parsed['path'] : '', '/');
        } else {
            $site_host = wp_parse_url(home_url(), PHP_URL_HOST);
            if ($site_host && strcasecmp((string) $parsed['host'], (string) $site_host) === 0) {
                $path = trailingslashit(ABSPATH) . ltrim(isset($parsed['path']) ? $parsed['path'] : '', '/');
            }
        }

        if ($path && file_exists($path)) {
            $bytes = @filesize($path);
            $size_source = 'local';
        }
    }

    $cache[$src] = array(
        'bytes' => $bytes !== false ? $bytes : null,
        'size_source' => $size_source,
        'fetch_ms' => round((microtime(true) - $start) * 1000, 2),
    );

    return $cache[$src];
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

function plugency_dev_help_group_by_source($items): array
{
    if (!is_array($items)) {
        return array();
    }

    $grouped = array();
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
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

function plugency_dev_help_hook_events(array $replace = null): array
{
    static $events = array();
    if (is_array($replace)) {
        $events = $replace;
    }
    return $events;
}

function plugency_dev_help_hook_stack(array $replace = null): array
{
    static $stack = array();
    if (is_array($replace)) {
        $stack = $replace;
    }
    return $stack;
}

function plugency_dev_help_register_hook_trace(string $tag): void
{
    if (!is_string($tag) || $tag === '') {
        return;
    }
    static $registered = array();
    if (isset($registered[$tag])) {
        return;
    }
    $registered[$tag] = true;

    add_action($tag, 'plugency_dev_help_hook_event_start', PHP_INT_MIN, 20);
    add_action($tag, 'plugency_dev_help_hook_event_end', PHP_INT_MAX, 20);
}

function plugency_dev_help_hook_event_start(...$args)
{
    $stack = plugency_dev_help_hook_stack();
    $stack[] = array(
        'tag' => current_filter(),
        'start' => microtime(true),
        'memory' => memory_get_usage(true),
    );
    plugency_dev_help_hook_stack($stack);

    return $args[0] ?? null;
}

function plugency_dev_help_hook_event_end(...$args)
{
    $stack = plugency_dev_help_hook_stack();
    $event = array_pop($stack);
    plugency_dev_help_hook_stack($stack);

    if (empty($event)) {
        return;
    }

    $duration = microtime(true) - $event['start'];
    $memory_delta = memory_get_usage(true) - $event['memory'];

    $events = plugency_dev_help_hook_events();
    $events[] = array(
        'tag' => $event['tag'],
        'duration' => $duration,
        'duration_ms' => $duration * 1000,
        'memory_delta' => $memory_delta,
        'ended_at' => microtime(true),
    );

    if (count($events) > 400) {
        $events = array_slice($events, -200);
    }

    plugency_dev_help_hook_events($events);

    return $args[0] ?? null;
}

function plugency_dev_help_hooks_insights(array $events): array
{
    if (empty($events)) {
        return array(
            'total' => 0,
            'slowest' => array(),
            'max' => 0,
            'threshold' => 0.05,
        );
    }

    $threshold = 0.05; // 50ms
    $slow = $events;
    usort($slow, static function ($a, $b) {
        return ($b['duration'] ?? 0) <=> ($a['duration'] ?? 0);
    });

    return array(
        'total' => count($events),
        'slowest' => array_slice($slow, 0, 20),
        'max' => $slow[0]['duration'],
        'threshold' => $threshold,
    );
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

    $active = get_option('active_plugins', array());
    $active = is_array($active) ? $active : array();
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
    $mu = is_array($mu) ? $mu : array();

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
    if (!is_array($crons)) {
        return array();
    }
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

function plugency_dev_help_get_debug_log(int $max_lines = 250, string $search = ''): array
{
    $max_lines = max(1, min(5000, $max_lines));
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
    $filtered = $tail;
    if ($search !== '') {
        $filtered = array_values(array_filter($tail, static function ($line) use ($search) {
            return stripos((string) $line, $search) !== false;
        }));
    }

    return array(
        'path' => $path,
        'status' => 'ok',
        'content' => implode("\n", $tail),
        'filtered' => implode("\n", $filtered),
        'matches' => count($filtered),
        'size' => filesize($path),
        'lines' => count($lines),
        'limit' => $max_lines,
    );
}

function plugency_dev_help_get_assets(): array
{
    global $wp_styles, $wp_scripts;

    $styles = array();
    $scripts = array();

    if (isset($wp_styles) && class_exists('WP_Styles') && $wp_styles instanceof WP_Styles) {
        $style_queue = is_array($wp_styles->queue) ? $wp_styles->queue : array();
        foreach ($style_queue as $handle) {
            $details = plugency_dev_help_classify_path(isset($wp_styles->registered[$handle]->src) ? $wp_styles->registered[$handle]->src : '');
            $meta = plugency_dev_help_asset_meta(isset($wp_styles->registered[$handle]->src) ? $wp_styles->registered[$handle]->src : '');
            $styles[] = array(
                'handle' => $handle,
                'src' => isset($wp_styles->registered[$handle]->src) ? $wp_styles->registered[$handle]->src : '',
                'category' => $details['category'],
                'category_label' => $details['category_label'],
                'source' => $details['source'],
                'bytes' => $meta['bytes'],
                'size_source' => $meta['size_source'],
                'fetch_ms' => $meta['fetch_ms'],
            );
        }
    }

    if (isset($wp_scripts) && class_exists('WP_Scripts') && $wp_scripts instanceof WP_Scripts) {
        $script_queue = is_array($wp_scripts->queue) ? $wp_scripts->queue : array();
        foreach ($script_queue as $handle) {
            $details = plugency_dev_help_classify_path(isset($wp_scripts->registered[$handle]->src) ? $wp_scripts->registered[$handle]->src : '');
            $meta = plugency_dev_help_asset_meta(isset($wp_scripts->registered[$handle]->src) ? $wp_scripts->registered[$handle]->src : '');
            $scripts[] = array(
                'handle' => $handle,
                'src' => isset($wp_scripts->registered[$handle]->src) ? $wp_scripts->registered[$handle]->src : '',
                'category' => $details['category'],
                'category_label' => $details['category_label'],
                'source' => $details['source'],
                'bytes' => $meta['bytes'],
                'size_source' => $meta['size_source'],
                'fetch_ms' => $meta['fetch_ms'],
            );
        }
    }

    return array($styles, $scripts);
}

function plugency_dev_help_asset_waterfall(array $styles, array $scripts): array
{
    $items = array();
    foreach (is_array($styles) ? $styles : array() as $style) {
        if (!is_array($style)) {
            continue;
        }
        $style['type'] = 'style';
        $items[] = $style;
    }
    foreach (is_array($scripts) ? $scripts : array() as $script) {
        if (!is_array($script)) {
            continue;
        }
        $script['type'] = 'script';
        $items[] = $script;
    }

    $max = 0;
    $total = 0;
    $measured = 0;

    foreach ($items as $item) {
        if (isset($item['bytes']) && $item['bytes'] !== null) {
            $total += (int) $item['bytes'];
            $max = max($max, (int) $item['bytes']);
            $measured++;
        }
    }

    usort($items, static function ($a, $b) {
        $a_bytes = isset($a['bytes']) ? (int) $a['bytes'] : 0;
        $b_bytes = isset($b['bytes']) ? (int) $b['bytes'] : 0;
        if ($a_bytes === $b_bytes) {
            $a_time = isset($a['fetch_ms']) ? (float) $a['fetch_ms'] : 0;
            $b_time = isset($b['fetch_ms']) ? (float) $b['fetch_ms'] : 0;
            return $b_time <=> $a_time;
        }
        return $b_bytes <=> $a_bytes;
    });

    return array(
        'items' => $items,
        'total_bytes' => $total,
        'max_bytes' => $max,
        'measured' => $measured,
        'top' => array_slice($items, 0, 20),
    );
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

function plugency_dev_help_query_tables(array $queries): array
{
    $table = array();
    foreach ($queries as $idx => $query) {
        $table[] = array(
            'i' => $idx + 1,
            'sql' => isset($query['sql']) ? $query['sql'] : '',
            'caller' => isset($query['caller']) ? $query['caller'] : '',
            'time' => isset($query['time']) ? (float) $query['time'] : 0,
        );
    }

    $duplicates_map = array();
    foreach ($table as $row) {
        $key = md5((string) $row['sql']);
        if (!isset($duplicates_map[$key])) {
            $duplicates_map[$key] = array(
                'sql' => $row['sql'],
                'count' => 0,
                'time' => 0,
                'caller' => $row['caller'],
            );
        }
        $duplicates_map[$key]['count']++;
        $duplicates_map[$key]['time'] += $row['time'];
    }
    $duplicates = array_values(array_filter($duplicates_map, static function ($item) {
        return isset($item['count']) && $item['count'] > 1;
    }));
    usort($duplicates, static function ($a, $b) {
        return $b['count'] <=> $a['count'];
    });

    $by_caller_map = array();
    foreach ($table as $row) {
        $caller = $row['caller'] !== '' ? $row['caller'] : '(unknown)';
        if (!isset($by_caller_map[$caller])) {
            $by_caller_map[$caller] = array(
                'caller' => $caller,
                'count' => 0,
                'time' => 0,
            );
        }
        $by_caller_map[$caller]['count']++;
        $by_caller_map[$caller]['time'] += $row['time'];
    }
    $by_caller = array_values($by_caller_map);
    usort($by_caller, static function ($a, $b) {
        return $b['time'] <=> $a['time'];
    });

    $timings = $table;
    usort($timings, static function ($a, $b) {
        return $b['time'] <=> $a['time'];
    });

    return array(
        'table' => $table,
        'duplicates' => $duplicates,
        'by_caller' => $by_caller,
        'timings' => array_slice($timings, 0, 50),
        'counts' => array(
            'total' => count($table),
            'duplicates' => count($duplicates),
            'callers' => count($by_caller),
            'timings' => count($timings),
        ),
    );
}

function plugency_dev_help_is_mysql(): bool
{
    global $wpdb;
    if (!isset($wpdb)) {
        return false;
    }
    if (property_exists($wpdb, 'is_mysql')) {
        return (bool) $wpdb->is_mysql;
    }
    if (defined('DB_TYPE') && strtolower((string) DB_TYPE) === 'sqlite') {
        return false;
    }
    if (property_exists($wpdb, 'use_mysqli') && !$wpdb->use_mysqli) {
        return false;
    }
    if (!empty($wpdb->db_server_info)) {
        $info = strtolower((string) $wpdb->db_server_info);
        if (strpos($info, 'sqlite') !== false) {
            return false;
        }
        if (strpos($info, 'mysql') !== false || strpos($info, 'mariadb') !== false) {
            return true;
        }
    }
    return false;
}

function plugency_dev_help_explain_slowest(array $insights): array
{
    global $wpdb;

    $result = array(
        'status' => 'unavailable',
        'message' => 'No slow queries to explain. Enable SAVEQUERIES and reload.',
        'sql' => '',
        'plan' => array(),
    );

    if (empty($insights['slowest'][0]['sql'])) {
        return $result;
    }

    $sql = $insights['slowest'][0]['sql'];
    $result['sql'] = $sql;

    if (!plugency_dev_help_is_mysql()) {
        $result['status'] = 'skipped';
        $result['message'] = 'EXPLAIN not supported by current DB driver.';
        return $result;
    }

    if (!preg_match('/^\\s*select/i', $sql)) {
        $result['status'] = 'skipped';
        $result['message'] = 'EXPLAIN only runs for SELECT statements.';
        return $result;
    }

    $plan = $wpdb->get_results('EXPLAIN ' . $sql, ARRAY_A);
    if ($wpdb->last_error) {
        $result['status'] = 'error';
        $result['message'] = 'EXPLAIN failed: ' . $wpdb->last_error;
        return $result;
    }

    if (empty($plan)) {
        $result['status'] = 'error';
        $result['message'] = 'EXPLAIN returned no rows.';
        return $result;
    }

    $result['status'] = 'ok';
    $result['message'] = 'EXPLAIN succeeded for slowest query.';
    $result['plan'] = $plan;

    return $result;
}

function plugency_dev_help_get_runtime_summary(
    array $included,
    array $styles,
    array $scripts,
    array $queries,
    array $requests,
    array $insights = array(),
    array $template_info = array(),
    array $flags = array(),
    array $debug_log = array(),
    array $active_plugins = array(),
    array $mu_plugins = array(),
    array $cron_events = array()
): array {
    $theme = wp_get_theme();
    $slowest = isset($insights['slowest'][0]) ? $insights['slowest'][0] : array();
    $normalized_sql = '';
    if (!empty($slowest['sql'])) {
        $normalized_sql = trim(preg_replace('/\s+/', ' ', (string) $slowest['sql']));
        if (strlen($normalized_sql) > 140) {
            $normalized_sql = substr($normalized_sql, 0, 140) . '...';
        }
    }

    $template_category = isset($template_info['template_category']) ? $template_info['template_category'] : '';
    $template_source = isset($template_info['template_source']) ? $template_info['template_source'] : '';
    $template_label = $template_category ? plugency_dev_help_category_label($template_category) : 'Template';

    $debug_log_status = isset($debug_log['status']) ? $debug_log['status'] : 'missing';
    $debug_log_label = $debug_log_status === 'ok' ? 'Available' : ucfirst($debug_log_status);
    $debug_log_size = isset($debug_log['size']) ? size_format((float) $debug_log['size']) : '0 B';
    $debug_log_updated = 'Unknown';
    if (!empty($debug_log['path']) && file_exists($debug_log['path'])) {
        $debug_log_mtime = @filemtime($debug_log['path']);
        if ($debug_log_mtime) {
            $debug_log_updated = function_exists('date_i18n') ? date_i18n('Y-m-d H:i:s', $debug_log_mtime) : date('Y-m-d H:i:s', $debug_log_mtime);
        }
    }

    $user = wp_get_current_user();
    $user_roles = !empty($user->roles) ? implode(', ', $user->roles) : 'None';

    $next_cron = !empty($cron_events) ? $cron_events[0] : array();
    $next_hook = isset($next_cron['hook']) ? $next_cron['hook'] : 'None scheduled';
    $next_schedule = isset($next_cron['schedule']) ? $next_cron['schedule'] : 'n/a';
    $next_cron_seconds = isset($next_cron['in_seconds']) ? (int) $next_cron['in_seconds'] : null;
    if ($next_cron_seconds !== null) {
        $next_cron_human = function_exists('human_time_diff') ? human_time_diff(time(), time() + $next_cron_seconds) : $next_cron_seconds . 's';
    } else {
        $next_cron_human = 'n/a';
    }
    $next_cron_time = isset($next_cron['time_utc']) ? $next_cron['time_utc'] . ' UTC' : 'n/a';

    $sample_plugins = array_slice(array_map(static function ($plugin) {
        return isset($plugin['name']) ? $plugin['name'] : '';
    }, $active_plugins), 0, 3);
    $sample_plugins = array_filter($sample_plugins);
    $sample_plugins_label = !empty($sample_plugins) ? implode(', ', $sample_plugins) : 'No active plugins';

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
            'sapi' => PHP_SAPI,
        ),
        'request' => array(
            'url' => (isset($_SERVER['HTTP_HOST'], $_SERVER['REQUEST_URI'])) ? esc_url_raw((is_ssl() ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']) : '',
            'method' => isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '',
            'user' => $user->user_login,
            'roles' => $user_roles,
        ),
        'template' => array(
            'file' => isset($template_info['template']) && $template_info['template'] !== '' ? $template_info['template'] : 'Not detected',
            'source' => $template_source !== '' ? $template_source : $template_label,
            'category' => $template_label,
            'matched_rule' => isset($template_info['matched_rule']) && $template_info['matched_rule'] !== '' ? $template_info['matched_rule'] : 'Not detected',
            'request' => isset($template_info['request']) && $template_info['request'] !== '' ? $template_info['request'] : 'Not set',
            'is_main_query' => isset($template_info['is_main_query']) ? ($template_info['is_main_query'] ? 'Yes' : 'No') : 'Unknown',
        ),
        'database' => array(
            'total_queries' => isset($insights['total']) ? (int) $insights['total'] : count($queries),
            'total_time' => isset($insights['time']) ? (float) $insights['time'] : 0,
            'slowest_time' => isset($slowest['time']) ? (float) $slowest['time'] : 0,
            'slowest_query' => $normalized_sql,
            'logging' => (defined('SAVEQUERIES') && SAVEQUERIES) ? 'On' : 'Off',
        ),
        'plugins' => array(
            'active_count' => count($active_plugins),
            'mu_count' => count($mu_plugins),
            'sample' => $sample_plugins_label,
        ),
        'cron' => array(
            'next_hook' => $next_hook,
            'next_schedule' => $next_schedule,
            'next_in' => $next_cron_human,
            'next_time' => $next_cron_time,
        ),
        'debug' => array(
            'environment' => isset($flags['WP_ENVIRONMENT_TYPE']) ? $flags['WP_ENVIRONMENT_TYPE'] : (function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'unknown'),
            'wp_debug' => (defined('WP_DEBUG') && WP_DEBUG) ? 'On' : 'Off',
            'script_debug' => (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? 'On' : 'Off',
            'savequeries' => (defined('SAVEQUERIES') && SAVEQUERIES) ? 'On' : 'Off',
            'disallow_file_mods' => defined('DISALLOW_FILE_MODS') ? (DISALLOW_FILE_MODS ? 'Yes' : 'No') : 'Not set',
            'debug_log_status' => $debug_log_label,
            'debug_log_size' => $debug_log_size,
            'debug_log_path' => isset($debug_log['path']) ? $debug_log['path'] : '',
            'debug_log_updated' => $debug_log_updated,
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
    $included_files = is_array($included_files) ? $included_files : array();
    list($styles, $scripts) = plugency_dev_help_get_assets();
    $styles = is_array($styles) ? $styles : array();
    $scripts = is_array($scripts) ? $scripts : array();
    $requests = plugency_dev_help_get_request_data();
    $requests = is_array($requests) ? $requests : array();
    $queries = plugency_dev_help_get_queries();
    $queries = is_array($queries) ? $queries : array();
    $debug_log = plugency_dev_help_get_debug_log();
    $insights = plugency_dev_help_query_insights($queries);
    $query_tables = plugency_dev_help_query_tables($queries);
    $query_explain = plugency_dev_help_explain_slowest($insights);
    $template_info = plugency_dev_help_get_template_info();
    $flags = plugency_dev_help_flags();
    $active_plugins = plugency_dev_help_get_active_plugins();
    $mu_plugins = plugency_dev_help_get_mu_plugins();
    $cron_events = plugency_dev_help_get_cron_events();
    $summary = plugency_dev_help_get_runtime_summary($included_files, $styles, $scripts, $queries, $requests, $insights, $template_info, $flags, $debug_log, $active_plugins, $mu_plugins, $cron_events);
    $grouped_files = plugency_dev_help_group_paths($included_files);
    $all_file_items = array();
    foreach ($grouped_files as $cat_items) {
        if (!is_array($cat_items)) {
            continue;
        }
        $all_file_items = array_merge($all_file_items, $cat_items);
    }
    $files_by_source = plugency_dev_help_group_by_source($all_file_items);
    $styles_by_source = plugency_dev_help_group_by_source($styles);
    $scripts_by_source = plugency_dev_help_group_by_source($scripts);
    $asset_waterfall = plugency_dev_help_asset_waterfall($styles, $scripts);
    $hook_events = plugency_dev_help_hook_events();
    $hook_insights = plugency_dev_help_hooks_insights($hook_events);

    return array(
        'summary' => $summary,
        'included_files' => $included_files,
        'files_grouped' => $grouped_files,
        'files_by_source' => $files_by_source,
        'styles' => $styles,
        'styles_by_source' => $styles_by_source,
        'scripts' => $scripts,
        'scripts_by_source' => $scripts_by_source,
        'asset_waterfall' => is_array($asset_waterfall) ? $asset_waterfall : array('items' => array(), 'total_bytes' => 0, 'max_bytes' => 0, 'measured' => 0, 'top' => array()),
        'requests' => $requests,
        'queries' => $queries,
        'insights' => $insights,
        'query_tables' => $query_tables,
        'query_explain' => $query_explain,
        'hooks' => array(
            'events' => is_array($hook_events) ? $hook_events : array(),
            'insights' => is_array($hook_insights) ? $hook_insights : array('total' => 0, 'slowest' => array(), 'max' => 0, 'threshold' => 0.05),
        ),
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
    $hook_insights = isset($snapshot['hooks']['insights']) && is_array($snapshot['hooks']['insights']) ? $snapshot['hooks']['insights'] : array('total' => 0, 'slowest' => array(), 'max' => 0, 'threshold' => 0.05);
    $hook_events = isset($snapshot['hooks']['events']) && is_array($snapshot['hooks']['events']) ? $snapshot['hooks']['events'] : array();
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
                <button type="button" class="plugency-button ghost" data-action="download-snapshot">Download JSON</button>
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
            <button data-tab="hooks" role="tab" aria-selected="false">Hooks</button>
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
                            <h3>Template</h3>
                            <span class="plugency-badge neutral"><?php echo esc_html($snapshot['summary']['template']['category']); ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>File</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['template']['file']); ?>"><?php echo esc_html($snapshot['summary']['template']['file']); ?></strong></li>
                            <li><span>Source</span><strong><?php echo esc_html($snapshot['summary']['template']['source']); ?></strong></li>
                            <li><span>Matched rule</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['template']['matched_rule']); ?>"><?php echo esc_html($snapshot['summary']['template']['matched_rule']); ?></strong></li>
                            <li><span>Request</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['template']['request']); ?>"><?php echo esc_html($snapshot['summary']['template']['request']); ?></strong></li>
                            <li><span>Main query</span><strong><?php echo esc_html($snapshot['summary']['template']['is_main_query']); ?></strong></li>
                        </ul>
                    </div>
            <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Request</h3>
                        <div class="plugency-inline-actions">
                            <button class="plugency-button ghost" type="button" data-action="copy-curl">Copy cURL</button>
                            <button class="plugency-button ghost" type="button" data-action="replay-request">Replay</button>
                            <label class="plugency-inline-input">
                                <span>Timeout</span>
                                <input type="number" min="1" max="120" step="1" value="30" data-role="replay-timeout" aria-label="Replay timeout (seconds)">
                                <span>s</span>
                            </label>
                            <span class="plugency-badge <?php echo is_admin() ? 'warn' : 'neutral'; ?>"><?php echo is_admin() ? 'Admin' : 'Front-end'; ?></span>
                        </div>
                    </div>
                <ul class="plugency-meta">
                    <li><span>URL</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['request']['url']); ?>"><?php echo esc_html($snapshot['summary']['request']['url']); ?></strong></li>
                            <li><span>Method</span><strong><?php echo esc_html($snapshot['summary']['request']['method']); ?></strong></li>
                    <li><span>User</span><strong><?php echo esc_html($snapshot['summary']['request']['user']); ?></strong></li>
                    <li><span>Roles</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['request']['roles']); ?>"><?php echo esc_html($snapshot['summary']['request']['roles']); ?></strong></li>
                </ul>
                <div class="plugency-pre compact" id="plugencyReplayOutput">
                    <pre>Replay results will appear here.</pre>
                </div>
                <p id="plugencyReplayStatus" class="plugency-status"></p>
            </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>PHP</h3>
                            <span class="plugency-badge neutral">Runtime</span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>PHP</span><strong><?php echo esc_html($snapshot['summary']['php']['version']); ?></strong></li>
                            <li><span>SAPI</span><strong><?php echo esc_html($snapshot['summary']['php']['sapi']); ?></strong></li>
                            <li><span>Memory limit</span><strong><?php echo esc_html($snapshot['summary']['php']['memory_limit']); ?></strong></li>
                            <li><span>Max execution</span><strong><?php echo esc_html($snapshot['summary']['php']['max_execution']); ?></strong></li>
                            <li><span>Peak usage</span><strong><?php echo esc_html($snapshot['summary']['php']['peak_memory']); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Database</h3>
                            <span class="plugency-badge <?php echo $snapshot['summary']['database']['logging'] === 'On' ? 'success' : 'warn'; ?>"><?php echo $snapshot['summary']['database']['logging'] === 'On' ? 'Logging on' : 'Logging off'; ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>Total queries</span><strong><?php echo esc_html($snapshot['summary']['database']['total_queries']); ?></strong></li>
                            <li><span>Total time</span><strong><?php echo esc_html(number_format_i18n($snapshot['summary']['database']['total_time'], 4)); ?>s</strong></li>
                            <li><span>Slowest</span><strong><?php echo $snapshot['summary']['database']['slowest_time'] > 0 ? esc_html(number_format_i18n($snapshot['summary']['database']['slowest_time'], 4) . 's') : esc_html('N/A'); ?></strong></li>
                            <li><span>Example</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['database']['slowest_query']); ?>"><?php echo $snapshot['summary']['database']['slowest_query'] !== '' ? esc_html($snapshot['summary']['database']['slowest_query']) : esc_html('No query captured'); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Plugins</h3>
                            <span class="plugency-badge neutral">Stack</span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>Active</span><strong><?php echo esc_html($snapshot['summary']['plugins']['active_count']); ?></strong></li>
                            <li><span>MU</span><strong><?php echo esc_html($snapshot['summary']['plugins']['mu_count']); ?></strong></li>
                            <li><span>Examples</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['plugins']['sample']); ?>"><?php echo esc_html($snapshot['summary']['plugins']['sample']); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Cron</h3>
                            <span class="plugency-badge neutral"><?php echo esc_html($snapshot['summary']['cron']['next_schedule']); ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>Next hook</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['cron']['next_hook']); ?>"><?php echo esc_html($snapshot['summary']['cron']['next_hook']); ?></strong></li>
                            <li><span>Runs in</span><strong><?php echo esc_html($snapshot['summary']['cron']['next_in']); ?></strong></li>
                            <li><span>Runs at</span><strong><?php echo esc_html($snapshot['summary']['cron']['next_time']); ?></strong></li>
                        </ul>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Debugging</h3>
                            <span class="plugency-badge neutral"><?php echo esc_html($snapshot['summary']['debug']['environment']); ?></span>
                        </div>
                        <ul class="plugency-meta">
                            <li><span>WP_DEBUG</span><strong><?php echo esc_html($snapshot['summary']['debug']['wp_debug']); ?></strong></li>
                            <li><span>SCRIPT_DEBUG</span><strong><?php echo esc_html($snapshot['summary']['debug']['script_debug']); ?></strong></li>
                            <li><span>SAVEQUERIES</span><strong><?php echo esc_html($snapshot['summary']['debug']['savequeries']); ?></strong></li>
                            <li><span>DISALLOW_FILE_MODS</span><strong><?php echo esc_html($snapshot['summary']['debug']['disallow_file_mods']); ?></strong></li>
                            <li><span>Debug log</span><strong class="plugency-ellipsis" title="<?php echo esc_attr($snapshot['summary']['debug']['debug_log_path']); ?>"><?php echo esc_html($snapshot['summary']['debug']['debug_log_status']); ?> (<?php echo esc_html($snapshot['summary']['debug']['debug_log_size']); ?>)</strong></li>
                            <li><span>Last updated</span><strong><?php echo esc_html($snapshot['summary']['debug']['debug_log_updated']); ?></strong></li>
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
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Asset Waterfall</h3>
                        <span class="plugency-badge neutral">Total <?php echo esc_html(size_format((float) $snapshot['asset_waterfall']['total_bytes'])); ?></span>
                    </div>
                    <p class="plugency-small">Sizes fetched from local files or HEAD requests when available. Top offenders shown by size.</p>
                    <div class="plugency-waterfall">
                        <?php if (!empty($snapshot['asset_waterfall']['top'])) : ?>
                            <?php foreach ($snapshot['asset_waterfall']['top'] as $asset) : ?>
                                <?php
                                $bytes = isset($asset['bytes']) ? (int) $asset['bytes'] : 0;
                                $width = ($snapshot['asset_waterfall']['max_bytes'] > 0 && $bytes > 0) ? min(100, ($bytes / $snapshot['asset_waterfall']['max_bytes']) * 100) : 0;
                                ?>
                                <div class="plugency-waterfall-item">
                                    <div class="plugency-timeline-row">
                                        <span class="plugency-timeline-tag"><?php echo esc_html($asset['handle']); ?> <span class="plugency-badge neutral"><?php echo esc_html(ucfirst($asset['type'])); ?></span></span>
                                        <span class="plugency-timeline-meta"><?php echo $bytes > 0 ? esc_html(size_format((float) $bytes)) : 'n/a'; ?></span>
                                    </div>
                                    <div class="plugency-bar" style="width: <?php echo esc_attr($width); ?>%;"></div>
                                    <div class="plugency-timeline-meta small">
                                        Source: <?php echo !empty($asset['source']) ? esc_html($asset['source']) : 'Unknown'; ?> |
                                        Fetch: <?php echo isset($asset['fetch_ms']) ? esc_html(number_format_i18n((float) $asset['fetch_ms'], 1)) . 'ms' : 'n/a'; ?> |
                                        <?php if (!empty($asset['src'])) : ?>
                                            <span class="plugency-ellipsis" title="<?php echo esc_attr($asset['src']); ?>">URL: <?php echo esc_html($asset['src']); ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php else : ?>
                            <p class="plugency-small">No asset sizes available.</p>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="requests">
                <div class="plugency-grid two">
                    <?php
                    $request_sections = array(
                        'GET' => 'GET',
                        'POST' => 'POST',
                        'COOKIE' => 'Cookies',
                        'SERVER' => 'Server',
                        'FILES' => 'Files',
                        'REQUEST' => 'Request',
                        'SESSION' => 'Session',
                        'ENV' => 'Env',
                        'HEADERS' => 'Headers',
                    );
                    ?>
                    <?php foreach ($request_sections as $key => $label) : ?>
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3><?php echo esc_html($label); ?></h3>
                                <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyRequests_<?php echo esc_attr($key); ?>">Copy</button>
                            </div>
                            <div id="plugencyRequests_<?php echo esc_attr($key); ?>" class="plugency-pre">
                                <?php plugency_dev_help_print_pre(isset($snapshot['requests'][$key]) ? $snapshot['requests'][$key] : array()); ?>
                            </div>
                        </div>
                    <?php endforeach; ?>
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
                <div class="plugency-card">
                    <div class="plugency-query-layout">
                        <div class="plugency-query-nav" data-role="query-tab" role="tablist" aria-label="Database query tabs">
                            <?php
                            $query_tabs = array(
                                'overview' => 'Overview',
                                'all' => 'All Queries (' . intval($snapshot['query_tables']['counts']['total']) . ')',
                                'duplicates' => 'Duplicates (' . intval($snapshot['query_tables']['counts']['duplicates']) . ')',
                                'callers' => 'By Callers (' . intval($snapshot['query_tables']['counts']['callers']) . ')',
                                'slowest' => 'Slowest (' . count($insights['slowest']) . ')',
                                'timings' => 'Timings (' . intval($snapshot['query_tables']['counts']['timings']) . ')',
                            );
                            $default_query_tab = 'overview';
                            foreach ($query_tabs as $key => $label) :
                                $is_active = $key === $default_query_tab;
                            ?>
                                <button
                                    id="plugencyQueryTab-<?php echo esc_attr($key); ?>"
                                    class="plugency-button ghost <?php echo $is_active ? 'active' : ''; ?>"
                                    type="button"
                                    role="tab"
                                    aria-selected="<?php echo $is_active ? 'true' : 'false'; ?>"
                                    aria-controls="plugencyQueryPanel-<?php echo esc_attr($key); ?>"
                                    tabindex="<?php echo $is_active ? '0' : '-1'; ?>"
                                    data-query-tab="<?php echo esc_attr($key); ?>"
                                >
                                    <?php echo esc_html($label); ?>
                                </button>
                            <?php endforeach; ?>
                        </div>
                        <div class="plugency-query-content" role="presentation">
                            <div class="plugency-query-actions">
                                <label class="plugency-switch" data-role="query-view">
                                    <input type="checkbox" data-query-view-toggle>
                                    <span class="plugency-switch-slider" title="Toggle array/table view"></span>
                                    <span class="plugency-switch-label" data-query-view-label>Array</span>
                                </label>
                                <button class="plugency-button ghost" data-action="toggle-query-log"><?php echo defined('SAVEQUERIES') && SAVEQUERIES ? 'Disable Query Logging' : 'Enable Query Logging'; ?></button>
                            </div>
                            <p class="plugency-hint">SAVEQUERIES <?php echo $snapshot['savequeries_enabled'] ? 'ON' : 'OFF'; ?>. Requires writable wp-config.php to toggle.</p>
                            <p id="queryToggleMsg" class="plugency-status"></p>
                            <div class="plugency-query-panels">
                                <div class="plugency-query-panel active" data-query-panel="overview" id="plugencyQueryPanel-overview" role="tabpanel" aria-labelledby="plugencyQueryTab-overview" aria-hidden="false">
                                    <div class="plugency-grid two">
                                        <div class="plugency-card flat">
                                            <div class="plugency-card-header">
                                                <h4>Query Overview</h4>
                                                <span class="plugency-badge <?php echo $snapshot['savequeries_enabled'] ? 'success' : 'warn'; ?>"><?php echo $snapshot['savequeries_enabled'] ? 'Logging on' : 'Logging off'; ?></span>
                                            </div>
                                            <ul class="plugency-meta">
                                                <li><span>Total queries</span><strong><?php echo esc_html($insights['total']); ?></strong></li>
                                                <li><span>Total time</span><strong><?php echo esc_html(number_format_i18n($insights['time'], 4)); ?>s</strong></li>
                                                <li><span>Avg/query</span><strong><?php echo $insights['total'] > 0 ? esc_html(number_format_i18n($insights['time'] / max(1, $insights['total']), 6)) . 's' : 'n/a'; ?></strong></li>
                                                <li><span>Logging</span><strong><?php echo $snapshot['savequeries_enabled'] ? 'On' : 'Off'; ?></strong></li>
                                                <li><span>Slowest</span><strong><?php echo !empty($insights['slowest'][0]['time']) ? esc_html(number_format_i18n((float) $insights['slowest'][0]['time'], 4) . 's') : 'n/a'; ?></strong></li>
                                            </ul>
                                        </div>
                                        <div class="plugency-card flat">
                                            <div class="plugency-card-header">
                                                <h4>Query EXPLAIN (slowest)</h4>
                                                <?php
                                                $explain_status = isset($snapshot['query_explain']['status']) ? $snapshot['query_explain']['status'] : 'unavailable';
                                                $explain_badge = $explain_status === 'ok' ? 'success' : 'warn';
                                                ?>
                                                <span class="plugency-badge <?php echo esc_attr($explain_badge); ?>"><?php echo esc_html(strtoupper($explain_status)); ?></span>
                                                <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyExplainPlan">Copy</button>
                                            </div>
                                            <p class="plugency-small"><?php echo esc_html(isset($snapshot['query_explain']['message']) ? $snapshot['query_explain']['message'] : ''); ?></p>
                                            <?php if (!empty($snapshot['query_explain']['sql'])) : ?>
                                                <p class="plugency-small">SQL: <?php echo esc_html($snapshot['query_explain']['sql']); ?></p>
                                            <?php endif; ?>
                                            <div id="plugencyExplainPlan" class="plugency-pre">
                                                <?php
                                                if (!empty($snapshot['query_explain']['plan'])) {
                                                    plugency_dev_help_print_pre($snapshot['query_explain']['plan']);
                                                } else {
                                                    echo '<pre>' . esc_html('No plan available.') . '</pre>';
                                                }
                                                ?>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="plugency-query-panel" data-query-panel="all" id="plugencyQueryPanel-all" role="tabpanel" aria-labelledby="plugencyQueryTab-all" aria-hidden="true" hidden>
                                    <div class="plugency-pre plugency-query-view" data-query-view-target="array" data-target-id="plugencyQueries">
                                        <?php plugency_dev_help_print_pre($snapshot['queries']); ?>
                                    </div>
                                    <div class="plugency-table-wrapper plugency-query-view" data-query-view-target="table">
                                        <table class="plugency-table">
                                            <thead>
                                                <tr><th>#</th><th>Query</th><th>Caller</th><th>Time (s)</th></tr>
                                            </thead>
                                            <tbody>
                                                <?php foreach ($snapshot['query_tables']['table'] as $row) : ?>
                                                    <tr>
                                                        <td><?php echo esc_html($row['i']); ?></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['sql']); ?>"><?php echo esc_html($row['sql']); ?></span></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['caller']); ?>"><?php echo esc_html($row['caller']); ?></span></td>
                                                        <td><?php echo esc_html(number_format_i18n((float) $row['time'], 4)); ?></td>
                                                    </tr>
                                                <?php endforeach; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div class="plugency-query-panel" data-query-panel="duplicates" id="plugencyQueryPanel-duplicates" role="tabpanel" aria-labelledby="plugencyQueryTab-duplicates" aria-hidden="true" hidden>
                                    <div class="plugency-pre plugency-query-view" data-query-view-target="array">
                                        <?php plugency_dev_help_print_pre($snapshot['query_tables']['duplicates']); ?>
                                    </div>
                                    <div class="plugency-table-wrapper plugency-query-view" data-query-view-target="table">
                                        <table class="plugency-table">
                                            <thead>
                                                <tr><th>Count</th><th>Query</th><th>Caller</th><th>Total Time (s)</th></tr>
                                            </thead>
                                            <tbody>
                                                <?php foreach ($snapshot['query_tables']['duplicates'] as $row) : ?>
                                                    <tr>
                                                        <td><?php echo esc_html($row['count']); ?></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['sql']); ?>"><?php echo esc_html($row['sql']); ?></span></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['caller']); ?>"><?php echo esc_html($row['caller']); ?></span></td>
                                                        <td><?php echo esc_html(number_format_i18n((float) $row['time'], 4)); ?></td>
                                                    </tr>
                                                <?php endforeach; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div class="plugency-query-panel" data-query-panel="callers" id="plugencyQueryPanel-callers" role="tabpanel" aria-labelledby="plugencyQueryTab-callers" aria-hidden="true" hidden>
                                    <div class="plugency-pre plugency-query-view" data-query-view-target="array">
                                        <?php plugency_dev_help_print_pre($snapshot['query_tables']['by_caller']); ?>
                                    </div>
                                    <div class="plugency-table-wrapper plugency-query-view" data-query-view-target="table">
                                        <table class="plugency-table">
                                            <thead>
                                                <tr><th>Caller</th><th>Count</th><th>Total Time (s)</th></tr>
                                            </thead>
                                            <tbody>
                                                <?php foreach ($snapshot['query_tables']['by_caller'] as $row) : ?>
                                                    <tr>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['caller']); ?>"><?php echo esc_html($row['caller']); ?></span></td>
                                                        <td><?php echo esc_html($row['count']); ?></td>
                                                        <td><?php echo esc_html(number_format_i18n((float) $row['time'], 4)); ?></td>
                                                    </tr>
                                                <?php endforeach; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div class="plugency-query-panel" data-query-panel="timings" id="plugencyQueryPanel-timings" role="tabpanel" aria-labelledby="plugencyQueryTab-timings" aria-hidden="true" hidden>
                                    <div class="plugency-pre plugency-query-view" data-query-view-target="array">
                                        <?php plugency_dev_help_print_pre($snapshot['query_tables']['timings']); ?>
                                    </div>
                                    <div class="plugency-table-wrapper plugency-query-view" data-query-view-target="table">
                                        <table class="plugency-table">
                                            <thead>
                                                <tr><th>#</th><th>Query</th><th>Caller</th><th>Time (s)</th></tr>
                                            </thead>
                                            <tbody>
                                                <?php foreach ($snapshot['query_tables']['timings'] as $index => $row) : ?>
                                                    <tr>
                                                        <td><?php echo esc_html($index + 1); ?></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['sql']); ?>"><?php echo esc_html($row['sql']); ?></span></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['caller']); ?>"><?php echo esc_html($row['caller']); ?></span></td>
                                                        <td><?php echo esc_html(number_format_i18n((float) $row['time'], 4)); ?></td>
                                                    </tr>
                                                <?php endforeach; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div class="plugency-query-panel" data-query-panel="slowest" id="plugencyQueryPanel-slowest" role="tabpanel" aria-labelledby="plugencyQueryTab-slowest" aria-hidden="true" hidden>
                                    <div class="plugency-pre plugency-query-view" data-query-view-target="array">
                                        <?php plugency_dev_help_print_pre($insights['slowest']); ?>
                                    </div>
                                    <div class="plugency-table-wrapper plugency-query-view" data-query-view-target="table">
                                        <table class="plugency-table">
                                            <thead>
                                                <tr><th>#</th><th>Query</th><th>Caller</th><th>Time (s)</th></tr>
                                            </thead>
                                            <tbody>
                                                <?php foreach ($insights['slowest'] as $idx => $row) : ?>
                                                    <tr>
                                                        <td><?php echo esc_html($idx + 1); ?></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['sql']); ?>"><?php echo esc_html($row['sql']); ?></span></td>
                                                        <td><span class="plugency-ellipsis" title="<?php echo esc_attr($row['caller']); ?>"><?php echo esc_html($row['caller']); ?></span></td>
                                                        <td><?php echo esc_html(number_format_i18n((float) $row['time'], 4)); ?></td>
                                                    </tr>
                                                <?php endforeach; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                    </div>
                </div>
            </div>
                </div>
            </div>

        <div class="plugency-section" data-section="hooks">
            <div class="plugency-grid two">
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Slowest Hooks (top 20)</h3>
                        <span class="plugency-badge neutral">Threshold <?php echo esc_html(number_format_i18n($hook_insights['threshold'] * 1000, 0)); ?>ms</span>
                    </div>
                    <div class="plugency-timeline">
                        <?php if (!empty($hook_insights['slowest'])) : ?>
                            <?php foreach ($hook_insights['slowest'] as $hook) : ?>
                                <?php
                                $dur = isset($hook['duration']) ? (float) $hook['duration'] : 0;
                                $dur_ms = $dur * 1000;
                                $flag = $dur >= $hook_insights['threshold'];
                                ?>
                                <div class="plugency-timeline-item <?php echo $flag ? 'slow' : ''; ?>">
                                    <div class="plugency-timeline-row">
                                        <span class="plugency-timeline-tag"><?php echo esc_html($hook['tag']); ?></span>
                                        <span class="plugency-timeline-meta"><?php echo esc_html(number_format_i18n($dur_ms, 2)); ?>ms</span>
                                    </div>
                                    <div class="plugency-bar" style="width: <?php echo $hook_insights['max'] > 0 ? esc_attr(min(100, ($dur / $hook_insights['max']) * 100)) : 0; ?>%;"></div>
                                    <div class="plugency-timeline-meta small">
                                        Memory Δ: <?php echo isset($hook['memory_delta']) ? esc_html(size_format((float) $hook['memory_delta'])) : 'n/a'; ?>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php else : ?>
                            <p class="plugency-small">No hooks recorded. Open this panel as an admin to start capturing.</p>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Hook Timeline (last <?php echo esc_html(count($hook_events)); ?>)</h3>
                        <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyHookTimeline">Copy</button>
                    </div>
                    <div id="plugencyHookTimeline" class="plugency-pre">
                        <?php plugency_dev_help_print_pre($hook_events); ?>
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
                        <div class="plugency-inline-actions wrap">
                            <button class="plugency-button ghost" data-action="refresh-log">Refresh</button>
                            <button class="plugency-button ghost" data-action="clear-log">Clear</button>
                            <button class="plugency-button ghost" data-action="copy-block" data-target="plugencyDebugLog">Copy</button>
                            <button class="plugency-button ghost" data-action="copy-matches">Copy matches</button>
                            <button class="plugency-button ghost" data-action="live-tail">Start live tail</button>
                            <button class="plugency-button ghost" data-action="write-test-log">Write test log</button>
                            <button class="plugency-button ghost" data-action="toggle-debug"><?php echo $snapshot['debug_enabled'] ? 'Disable debug logging' : 'Enable debug logging'; ?></button>
                        </div>
                        <div class="plugency-inline-actions wrap">
                            <label class="plugency-inline-input">
                                <span>Lines</span>
                                <input type="range" min="50" max="2000" step="50" value="250" data-role="log-lines" aria-label="Log lines">
                                <span data-role="log-lines-value">250</span>
                            </label>
                            <label class="plugency-inline-input">
                                <span>Search</span>
                                <input type="text" data-role="log-query" placeholder="Filter log (case-insensitive)">
                            </label>
                        </div>
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
    </div>
    <div class="plugency-inspect-tools" data-role="inspect-tools">
        <div class="plugency-inline-actions">
            <span class="plugency-small">Element inspector</span>
            <button class="plugency-button ghost" data-action="start-inspect">Inspect</button>
            <button class="plugency-button ghost" data-action="show-popups">Show</button>
            <button class="plugency-button ghost" data-action="hide-popups">Hide</button>
            <button class="plugency-button ghost" data-action="clear-popups">Clear</button>
        </div>
        <div class="plugency-inline-actions">
            <span class="plugency-small" data-role="popup-count">0 captured</span>
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
    $lines = isset($_POST['lines']) ? absint($_POST['lines']) : 250;
    $query = isset($_POST['query']) ? sanitize_text_field(wp_unslash((string) $_POST['query'])) : '';
    wp_send_json_success(plugency_dev_help_get_debug_log($lines, $query));
}

add_action('wp_ajax_plugency_refresh_debug_log', 'plugency_dev_help_refresh_debug_log_ajax');

function plugency_dev_help_write_test_log_ajax(): void
{
    plugency_dev_help_verify_ajax();

    if (!function_exists('error_log')) {
        wp_send_json_error('error_log not available', 500);
    }

    $message = 'Plugency test log @ ' . gmdate('c');
    $result = @error_log($message);

    if (!$result) {
        wp_send_json_error('Failed to write to debug log. Ensure WP_DEBUG and WP_DEBUG_LOG are enabled.', 500);
    }

    wp_send_json_success(array('message' => $message));
}

add_action('wp_ajax_plugency_write_test_log', 'plugency_dev_help_write_test_log_ajax');

function plugency_dev_help_replay_request(array $payload): array
{
    $url = isset($payload['url']) ? esc_url_raw($payload['url']) : '';
    if ($url === '') {
        return array('error' => 'Missing URL.');
    }

    $method = isset($payload['method']) ? strtoupper(sanitize_text_field((string) $payload['method'])) : 'GET';
    $timeout = isset($payload['timeout']) ? (int) $payload['timeout'] : 30;
    $timeout = max(1, min(120, $timeout));
    $headers = array();
    if (!empty($payload['headers']) && is_array($payload['headers'])) {
        foreach ($payload['headers'] as $name => $value) {
            if (stripos((string) $name, 'cookie') === 0 || stripos((string) $name, 'authorization') === 0) {
                continue;
            }
            $headers[$name] = is_array($value) ? implode(', ', array_map('strval', $value)) : (string) $value;
        }
    }
    $body = isset($payload['body']) ? $payload['body'] : array();

    $args = array(
        'method' => $method,
        'timeout' => $timeout,
        'redirection' => 0,
        'headers' => $headers,
        'body' => $body,
        'user-agent' => 'PlugencyDevHelp/' . PLUGENCY_DEV_HELP_VERSION . ' (' . home_url() . ')',
    );

    $started = microtime(true);
    $response = wp_remote_request($url, $args);
    $elapsed = microtime(true) - $started;

    if (is_wp_error($response)) {
        return array(
            'error' => $response->get_error_message(),
            'error_code' => $response->get_error_code(),
            'elapsed' => $elapsed,
            'timeout_used' => $timeout,
        );
    }

    $status = wp_remote_retrieve_response_code($response);
    $resp_headers = wp_remote_retrieve_headers($response);
    $headers_out = $resp_headers instanceof WP_Http_Headers ? $resp_headers->getAll() : (array) $resp_headers;
    $body_raw = wp_remote_retrieve_body($response);
    $limit = 4000;
    $preview = substr((string) $body_raw, 0, $limit);

    return array(
        'status' => $status,
        'elapsed' => $elapsed,
        'timeout_used' => $timeout,
        'headers' => $headers_out,
        'body_preview' => $preview,
        'body_length' => strlen((string) $body_raw),
        'truncated' => strlen((string) $body_raw) > $limit,
    );
}

function plugency_dev_help_replay_request_ajax(): void
{
    plugency_dev_help_verify_ajax();

    $url = isset($_POST['url']) ? esc_url_raw(wp_unslash((string) $_POST['url'])) : '';
    $method = isset($_POST['method']) ? sanitize_text_field(wp_unslash((string) $_POST['method'])) : 'GET';
    $headers_raw = isset($_POST['headers']) ? wp_unslash((string) $_POST['headers']) : '';
    $body_raw = isset($_POST['body']) ? wp_unslash((string) $_POST['body']) : '';
    $timeout = isset($_POST['timeout']) ? absint($_POST['timeout']) : 30;

    $headers = json_decode($headers_raw, true);
    $headers = is_array($headers) ? $headers : array();
    $body = json_decode($body_raw, true);
    if ($body === null && $body_raw !== '') {
        $body = $body_raw;
    }

    $result = plugency_dev_help_replay_request(
        array(
            'url' => $url,
            'method' => $method,
            'headers' => $headers,
            'body' => $body,
            'timeout' => $timeout,
        )
    );

    if (isset($result['error'])) {
        wp_send_json_error($result, 500);
    }

    wp_send_json_success($result);
}

add_action('wp_ajax_plugency_replay_request', 'plugency_dev_help_replay_request_ajax');

add_filter('render_block', 'plugency_dev_help_wrap_block', 20, 2);
add_filter('the_content', 'plugency_dev_help_wrap_content', 20, 1);
