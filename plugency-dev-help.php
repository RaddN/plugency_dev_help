<?php

/**
 * Plugin Name: Plugency Dev Help
 * Description: Developer-first debugging surface for quick insight into the current request. Shows included PHP files, assets, requests, database queries, and lets you manage debug logging (admin only).
 * Version: 1.1.6
 * Author: Raihan Hossain
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PLUGENCY_DEV_HELP_VERSION', '1.1.6');

/**
 * Guard utility to centralize capability checks.
 */
function plugency_dev_help_can_view(): bool
{
    return is_user_logged_in() && current_user_can('manage_options');
}

function plugency_dev_help_default_budgets(): array
{
    return array(
        'lcp_ms' => 2500,
        'fid_ms' => 100,
        'cls' => 0.1,
        'weight_kb' => 1800,
        'requests' => 120,
    );
}

function plugency_dev_help_get_budgets(): array
{
    $defaults = plugency_dev_help_default_budgets();
    $saved = get_option('plugency_dev_help_perf_budgets', array());
    if (!is_array($saved)) {
        $saved = array();
    }
    $budget = array();
    foreach ($defaults as $key => $value) {
        $val = isset($saved[$key]) ? $saved[$key] : $value;
        if (in_array($key, array('lcp_ms', 'fid_ms', 'weight_kb', 'requests'), true)) {
            $val = max(0, (int) $val);
        } elseif ($key === 'cls') {
            $val = max(0, (float) $val);
        }
        $budget[$key] = $val;
    }
    return $budget;
}

function plugency_dev_help_save_budgets(array $input): array
{
    $current = plugency_dev_help_default_budgets();
    foreach ($current as $key => $default) {
        if (!isset($input[$key])) {
            continue;
        }
        if (in_array($key, array('lcp_ms', 'fid_ms', 'weight_kb', 'requests'), true)) {
            $current[$key] = max(0, (int) $input[$key]);
        } elseif ($key === 'cls') {
            $current[$key] = max(0, (float) $input[$key]);
        }
    }
    update_option('plugency_dev_help_perf_budgets', $current, false);
    return $current;
}

function plugency_dev_help_default_perf_tests(): array
{
    return array(
        'history' => array(),
        'schedules' => array(),
        'alerts' => array(),
        'webhook' => '',
    );
}

function plugency_dev_help_normalize_perf_result(array $result): array
{
    $metrics = isset($result['metrics']) && is_array($result['metrics']) ? $result['metrics'] : array();
    $safe_metrics = array();
    foreach (array('lcp_ms', 'cls', 'fid_ms', 'ttfb_ms', 'fcp_ms', 'fp_ms', 'weight_kb', 'requests') as $key) {
        if (!isset($metrics[$key])) {
            $safe_metrics[$key] = null;
            continue;
        }
        if ($key === 'cls') {
            $safe_metrics[$key] = (float) $metrics[$key];
        } else {
            $safe_metrics[$key] = is_numeric($metrics[$key]) ? (float) $metrics[$key] : null;
        }
    }

    return array(
        'id' => isset($result['id']) ? sanitize_text_field((string) $result['id']) : uniqid('perf_', true),
        'ts' => isset($result['ts']) ? (int) $result['ts'] : time(),
        'url' => isset($result['url']) ? esc_url_raw((string) $result['url']) : '',
        'profile' => isset($result['profile']) && is_array($result['profile']) ? $result['profile'] : array(),
        'metrics' => $safe_metrics,
        'source' => isset($result['source']) ? sanitize_text_field((string) $result['source']) : 'browser',
        'note' => isset($result['note']) ? sanitize_text_field((string) $result['note']) : '',
    );
}

function plugency_dev_help_get_perf_tests(): array
{
    $saved = get_option('plugency_dev_help_perf_tests', array());
    if (!is_array($saved)) {
        $saved = array();
    }
    $defaults = plugency_dev_help_default_perf_tests();
    $merged = array_merge($defaults, $saved);
    $merged['history'] = array_slice(is_array($merged['history']) ? $merged['history'] : array(), 0, 80);
    $merged['alerts'] = array_slice(is_array($merged['alerts']) ? $merged['alerts'] : array(), 0, 80);
    $merged['schedules'] = is_array($merged['schedules']) ? array_values($merged['schedules']) : array();
    $merged['webhook'] = isset($merged['webhook']) ? esc_url_raw((string) $merged['webhook']) : '';
    return $merged;
}

function plugency_dev_help_perf_frequency_seconds(string $frequency): int
{
    switch ($frequency) {
        case '15m':
            return 15 * MINUTE_IN_SECONDS;
        case 'hourly':
            return HOUR_IN_SECONDS;
        case '6h':
            return 6 * HOUR_IN_SECONDS;
        case 'daily':
            return DAY_IN_SECONDS;
        case 'weekly':
            return WEEK_IN_SECONDS;
        default:
            return HOUR_IN_SECONDS;
    }
}

function plugency_dev_help_save_perf_tests(array $data): array
{
    $current = plugency_dev_help_get_perf_tests();
    if (isset($data['history']) && is_array($data['history'])) {
        $current['history'] = array_slice(array_map('plugency_dev_help_normalize_perf_result', $data['history']), 0, 80);
    }
    if (isset($data['alerts']) && is_array($data['alerts'])) {
        $current['alerts'] = array_slice($data['alerts'], 0, 80);
    }
    if (isset($data['webhook'])) {
        $current['webhook'] = esc_url_raw((string) $data['webhook']);
    }
    if (isset($data['schedules']) && is_array($data['schedules'])) {
        $sanitized = array();
        foreach ($data['schedules'] as $schedule) {
            if (!is_array($schedule) || empty($schedule['url'])) {
                continue;
            }
            $frequency = isset($schedule['frequency']) ? sanitize_text_field((string) $schedule['frequency']) : 'daily';
            $sanitized[] = array(
                'id' => isset($schedule['id']) ? sanitize_text_field((string) $schedule['id']) : uniqid('sched_', true),
                'url' => esc_url_raw((string) $schedule['url']),
                'frequency' => $frequency,
                'profile' => isset($schedule['profile']) && is_array($schedule['profile']) ? $schedule['profile'] : array(),
                'next_run' => isset($schedule['next_run']) ? (int) $schedule['next_run'] : (time() + plugency_dev_help_perf_frequency_seconds($frequency)),
                'last_run' => isset($schedule['last_run']) ? (int) $schedule['last_run'] : 0,
            );
        }
        $current['schedules'] = $sanitized;
    }
    update_option('plugency_dev_help_perf_tests', $current, false);
    return $current;
}

function plugency_dev_help_record_perf_result(array $result): array
{
    $data = plugency_dev_help_get_perf_tests();
    $normalized = plugency_dev_help_normalize_perf_result($result);
    array_unshift($data['history'], $normalized);
    $data['history'] = array_slice($data['history'], 0, 80);
    update_option('plugency_dev_help_perf_tests', $data, false);
    return $data;
}

function plugency_dev_help_probe_url(string $url): array
{
    if ($url === '') {
        return array();
    }
    $start = microtime(true);
    $response = wp_remote_get(
        $url,
        array(
            'timeout' => 12,
            'redirection' => 3,
            'user-agent' => 'plugency-dev-help/1.0',
        )
    );
    $elapsed = (microtime(true) - $start) * 1000;
    $status = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
    $body = is_wp_error($response) ? '' : wp_remote_retrieve_body($response);
    $bytes = strlen((string) $body);

    return plugency_dev_help_normalize_perf_result(
        array(
            'url' => $url,
            'source' => 'server-probe',
            'ts' => time(),
            'metrics' => array(
                'ttfb_ms' => round($elapsed, 2),
                'weight_kb' => $bytes > 0 ? round($bytes / 1024, 2) : null,
                'requests' => null,
            ),
            'note' => $status ? 'Server probe (TTFB/size only).' : 'Probe failed',
        )
    );
}

function plugency_dev_help_execute_perf_schedules(): void
{
    $data = plugency_dev_help_get_perf_tests();
    if (empty($data['schedules'])) {
        return;
    }
    $updated = false;
    foreach ($data['schedules'] as &$schedule) {
        $next_run = isset($schedule['next_run']) ? (int) $schedule['next_run'] : 0;
        if ($next_run > time()) {
            continue;
        }
        $result = plugency_dev_help_probe_url(isset($schedule['url']) ? (string) $schedule['url'] : '');
        if (!empty($result)) {
            array_unshift($data['history'], $result);
            $data['history'] = array_slice($data['history'], 0, 80);
        }
        $schedule['last_run'] = time();
        $schedule['next_run'] = time() + plugency_dev_help_perf_frequency_seconds(isset($schedule['frequency']) ? (string) $schedule['frequency'] : 'daily');
        $updated = true;
    }
    if ($updated) {
        plugency_dev_help_save_perf_tests($data);
    }
}

add_action('plugency_dev_help_perf_test_cron', 'plugency_dev_help_execute_perf_schedules');

function plugency_dev_help_log_budget_violation(string $metric, $actual, $budget): void
{
    $message = sprintf(
        '[Plugency] Budget exceeded: %s actual=%s budget=%s url=%s time=%s',
        $metric,
        is_scalar($actual) ? $actual : json_encode($actual),
        is_scalar($budget) ? $budget : json_encode($budget),
        isset($_SERVER['REQUEST_URI']) ? esc_url_raw((string) $_SERVER['REQUEST_URI']) : '(unknown)',
        gmdate('c')
    );
    if (function_exists('error_log')) {
        @error_log($message);
    }
}

function plugency_dev_help_opcache_info(): array
{
    $available = function_exists('opcache_get_status');
    $status = $available ? @opcache_get_status(false) : null;
    $config = $available && function_exists('opcache_get_configuration') ? @opcache_get_configuration() : null;
    $enabled = $available && is_array($status) && isset($status['opcache_enabled']) ? (bool) $status['opcache_enabled'] : false;
    $scripts = array();
    $missed = array();
    $history = get_option('plugency_dev_help_opcache_history', array());
    if (!is_array($history)) {
        $history = array();
    }
    if ($enabled && isset($status['scripts']) && is_array($status['scripts'])) {
        $scripts = array_values($status['scripts']);
    }
    if ($enabled && isset($status['scripts']) && is_array($status['scripts'])) {
        $cached_paths = array_map(static function ($item) {
            return isset($item['full_path']) ? (string) $item['full_path'] : '';
        }, $status['scripts']);
        $cached_lookup = array_flip(array_filter($cached_paths));
        $included = get_included_files();
        foreach ($included as $file) {
            if (!isset($cached_lookup[$file])) {
                $missed[] = $file;
            }
        }
        $missed = array_slice($missed, 0, 50);
    }
    if ($enabled && isset($status['opcache_statistics']) && is_array($status['opcache_statistics'])) {
        $stats = $status['opcache_statistics'];
        $used_memory = isset($status['memory_usage']['used_memory']) ? (float) $status['memory_usage']['used_memory'] : 0;
        $free_memory = isset($status['memory_usage']['free_memory']) ? (float) $status['memory_usage']['free_memory'] : 0;
        $wasted_memory = isset($status['memory_usage']['wasted_memory']) ? (float) $status['memory_usage']['wasted_memory'] : 0;
        $hits = isset($stats['hits']) ? (float) $stats['hits'] : 0;
        $misses = isset($stats['misses']) ? (float) $stats['misses'] : 0;
        $hit_rate = ($hits + $misses) > 0 ? ($hits / ($hits + $misses)) * 100 : 0;
        $memory_total = $used_memory + $free_memory + $wasted_memory;
        $entry = array(
            'time' => gmdate('c'),
            'hit_rate' => round($hit_rate, 2),
            'used' => $used_memory,
            'free' => $free_memory,
            'wasted' => $wasted_memory,
            'total' => $memory_total,
        );
        array_unshift($history, $entry);
        if (count($history) > 40) {
            $history = array_slice($history, 0, 40);
        }
        update_option('plugency_dev_help_opcache_history', $history, false);
    }
    $recommended = array(
        'opcache.validate_timestamps' => '0 (set to 0 in production)',
        'opcache.revalidate_freq' => '60',
        'opcache.memory_consumption' => '128 or higher',
        'opcache.interned_strings_buffer' => '16 or higher',
        'opcache.max_accelerated_files' => '10000+ depending on site size',
        'opcache.enable_cli' => '0 (unless CLI caching needed)',
    );
    return array(
        'available' => $available,
        'enabled' => $enabled,
        'status' => is_array($status) ? $status : array(),
        'config' => is_array($config) ? $config : array(),
        'scripts' => $scripts,
        'missed' => $missed,
        'history' => $history,
        'recommended' => $recommended,
    );
}

function plugency_dev_help_cpt_taxonomy_info(): array
{
    $post_types = get_post_types(array(), 'objects');
    $taxonomies = get_taxonomies(array(), 'objects');
    $registrar = array();
    $get_registrar = static function ($obj) use (&$registrar) {
        $file = '';
        if (!empty($obj->_builtin)) {
            $file = 'core';
        } else {
            $file = isset($obj->plugin) ? $obj->plugin : '';
            if (!$file && isset($obj->register_meta_box_cb) && is_callable($obj->register_meta_box_cb)) {
                $ref = new ReflectionFunction($obj->register_meta_box_cb);
                $file = (string) $ref->getFileName();
            }
        }
        return $file ?: '(unknown)';
    };
    $cpt_items = array();
    foreach ($post_types as $name => $obj) {
        $registrar_file = $get_registrar($obj);
        $counts = wp_count_posts($name);
        $total = 0;
        if ($counts && is_object($counts)) {
            foreach ((array) $counts as $status => $count) {
                $total += (int) $count;
            }
        }
        $cpt_items[] = array(
            'name' => $name,
            'label' => isset($obj->label) ? $obj->label : $name,
            'registrar' => $registrar_file,
            'public' => !empty($obj->public),
            'show_in_rest' => !empty($obj->show_in_rest),
            'has_archive' => !empty($obj->has_archive),
            'hierarchical' => !empty($obj->hierarchical),
            'rest_base' => isset($obj->rest_base) ? $obj->rest_base : '',
            'rewrite' => isset($obj->rewrite) ? $obj->rewrite : array(),
            'total' => $total,
            'taxonomies' => isset($obj->taxonomies) ? (array) $obj->taxonomies : array(),
        );
    }
    $tax_items = array();
    foreach ($taxonomies as $name => $obj) {
        $registrar_file = $get_registrar($obj);
        $terms = get_terms(array('taxonomy' => $name, 'hide_empty' => false, 'number' => 1, 'fields' => 'count'));
        $count = is_wp_error($terms) ? 0 : (int) $terms;
        $tax_items[] = array(
            'name' => $name,
            'label' => isset($obj->label) ? $obj->label : $name,
            'registrar' => $registrar_file,
            'public' => !empty($obj->public),
            'show_in_rest' => !empty($obj->show_in_rest),
            'hierarchical' => !empty($obj->hierarchical),
            'rewrite' => isset($obj->rewrite) ? $obj->rewrite : array(),
            'object_type' => isset($obj->object_type) ? (array) $obj->object_type : array(),
            'count' => $count,
        );
    }
    global $wp_rewrite;
    $rewrite_rules = $wp_rewrite instanceof WP_Rewrite ? $wp_rewrite->wp_rewrite_rules() : array();
    $conflicts = array();
    if (is_array($rewrite_rules)) {
        $seen = array();
        foreach ($rewrite_rules as $regex => $target) {
            if (isset($seen[$regex])) {
                $conflicts[] = array('regex' => $regex, 'targets' => array($seen[$regex], $target));
            } else {
                $seen[$regex] = $target;
            }
        }
    }
    return array(
        'post_types' => $cpt_items,
        'taxonomies' => $tax_items,
        'rewrite_conflicts' => $conflicts,
    );
}

function plugency_dev_help_default_heartbeat_settings(): array
{
    return array(
        'intervals' => array(
            'frontend' => 60,
            'admin' => 30,
            'post_edit' => 15,
        ),
        'disable_dashboard' => true,
        'disable_list_screens' => true,
        'ab_test' => array(
            'variant_a' => 30,
            'variant_b' => 60,
            'enabled' => false,
        ),
    );
}

function plugency_dev_help_recommended_heartbeat_settings(): array
{
    return array(
        'intervals' => array(
            'frontend' => 60,
            'admin' => 45,
            'post_edit' => 20,
        ),
        'disable_dashboard' => true,
        'disable_list_screens' => true,
        'ab_test' => array(
            'variant_a' => 30,
            'variant_b' => 60,
            'enabled' => false,
        ),
    );
}

function plugency_dev_help_get_heartbeat_settings(): array
{
    $defaults = plugency_dev_help_default_heartbeat_settings();
    $saved = get_option('plugency_dev_help_heartbeat', array());
    if (!is_array($saved)) {
        $saved = array();
    }
    $intervals = isset($saved['intervals']) && is_array($saved['intervals']) ? $saved['intervals'] : array();
    $settings = $defaults;
    foreach ($defaults['intervals'] as $key => $val) {
        if (isset($intervals[$key])) {
            $settings['intervals'][$key] = max(1, (int) $intervals[$key]);
        }
    }
    $settings['disable_dashboard'] = isset($saved['disable_dashboard']) ? (bool) $saved['disable_dashboard'] : $defaults['disable_dashboard'];
    $settings['disable_list_screens'] = isset($saved['disable_list_screens']) ? (bool) $saved['disable_list_screens'] : $defaults['disable_list_screens'];
    $ab = isset($saved['ab_test']) && is_array($saved['ab_test']) ? $saved['ab_test'] : array();
    $settings['ab_test'] = array(
        'variant_a' => isset($ab['variant_a']) ? max(1, (int) $ab['variant_a']) : $defaults['ab_test']['variant_a'],
        'variant_b' => isset($ab['variant_b']) ? max(1, (int) $ab['variant_b']) : $defaults['ab_test']['variant_b'],
        'enabled' => isset($ab['enabled']) ? (bool) $ab['enabled'] : $defaults['ab_test']['enabled'],
    );
    return $settings;
}

function plugency_dev_help_save_heartbeat_settings(array $input): array
{
    $current = plugency_dev_help_get_heartbeat_settings();
    if (isset($input['intervals']) && is_array($input['intervals'])) {
        foreach ($current['intervals'] as $key => $val) {
            if (isset($input['intervals'][$key])) {
                $current['intervals'][$key] = max(1, (int) $input['intervals'][$key]);
            }
        }
    }
    if (isset($input['disable_dashboard'])) {
        $current['disable_dashboard'] = (bool) $input['disable_dashboard'];
    }
    if (isset($input['disable_list_screens'])) {
        $current['disable_list_screens'] = (bool) $input['disable_list_screens'];
    }
    if (isset($input['ab_test']) && is_array($input['ab_test'])) {
        $ab = $input['ab_test'];
        $current['ab_test']['variant_a'] = isset($ab['variant_a']) ? max(1, (int) $ab['variant_a']) : $current['ab_test']['variant_a'];
        $current['ab_test']['variant_b'] = isset($ab['variant_b']) ? max(1, (int) $ab['variant_b']) : $current['ab_test']['variant_b'];
        $current['ab_test']['enabled'] = isset($ab['enabled']) ? (bool) $ab['enabled'] : $current['ab_test']['enabled'];
    }
    update_option('plugency_dev_help_heartbeat', $current, false);
    return $current;
}

function plugency_dev_help_is_heartbeat_request(): bool
{
    return defined('DOING_AJAX') && DOING_AJAX && isset($_POST['action']) && $_POST['action'] === 'heartbeat';
}

function plugency_dev_help_heartbeat_page_type(): string
{
    if (is_admin()) {
        global $pagenow;
        if ($pagenow === 'post.php' || $pagenow === 'post-new.php') {
            return 'post_edit';
        }
        if ($pagenow === 'index.php' || $pagenow === 'dashboard.php') {
            return 'dashboard';
        }
        if ($pagenow && strpos((string) $pagenow, 'edit.php') !== false) {
            return 'list';
        }
        return 'admin';
    }
    return 'frontend';
}

function plugency_dev_help_record_heartbeat(array $data, string $screen_id = ''): void
{
    $log = get_option('plugency_dev_help_heartbeat_log', array());
    if (!is_array($log)) {
        $log = array();
    }
    $start = isset($GLOBALS['plugency_heartbeat_start']) ? (float) $GLOBALS['plugency_heartbeat_start'] : microtime(true);
    $duration = microtime(true) - $start;
    $payload_size = strlen(json_encode($data));
    $memory = function_exists('memory_get_peak_usage') ? memory_get_peak_usage(true) : 0;
    $page_type = plugency_dev_help_heartbeat_page_type();
    $settings = plugency_dev_help_get_heartbeat_settings();
    $interval = isset($settings['intervals'][$page_type]) ? (int) $settings['intervals'][$page_type] : 15;
    $entry = array(
        'time' => gmdate('c'),
        'page_type' => $page_type,
        'screen' => $screen_id,
        'payload_bytes' => $payload_size,
        'duration_ms' => round($duration * 1000, 2),
        'memory_bytes' => $memory,
        'interval' => $interval,
        'keys' => array_keys($data),
    );
    array_unshift($log, $entry);
    if (count($log) > 40) {
        $log = array_slice($log, 0, 40);
    }
    update_option('plugency_dev_help_heartbeat_log', $log, false);
}

function plugency_dev_help_heartbeat_usage(array $log): array
{
    $usage = array();
    foreach ($log as $entry) {
        if (!isset($entry['keys']) || !is_array($entry['keys'])) {
            continue;
        }
        foreach ($entry['keys'] as $key) {
            $label = (string) $key;
            if (!isset($usage[$label])) {
                $usage[$label] = 0;
            }
            $usage[$label]++;
        }
    }
    arsort($usage);
    return $usage;
}

function plugency_dev_help_estimate_heartbeat_savings(array $log, array $settings, array $recommended): array
{
    $total_cost_ms = 0;
    $total_events = 0;
    foreach ($log as $entry) {
        $total_cost_ms += isset($entry['duration_ms']) ? (float) $entry['duration_ms'] : 0;
        $total_events++;
    }
    $estimated = array(
        'events' => $total_events,
        'runtime_ms' => round($total_cost_ms, 2),
        'savings_ms' => 0,
        'savings_pct' => 0,
    );
    if ($total_events === 0) {
        return $estimated;
    }
    foreach ($log as $entry) {
        $type = isset($entry['page_type']) ? $entry['page_type'] : 'admin';
        $actual_interval = isset($entry['interval']) ? (int) $entry['interval'] : 15;
        $recommended_interval = isset($recommended['intervals'][$type]) ? (int) $recommended['intervals'][$type] : $actual_interval;
        if ($recommended_interval > $actual_interval) {
            $ratio = ($recommended_interval / max(1, $actual_interval)) - 1;
            $estimated['savings_ms'] += ($entry['duration_ms'] ?? 0) * $ratio;
        }
    }
    if ($estimated['runtime_ms'] > 0) {
        $estimated['savings_pct'] = round(($estimated['savings_ms'] / $estimated['runtime_ms']) * 100, 2);
    }
    $estimated['savings_ms'] = round($estimated['savings_ms'], 2);
    return $estimated;
}

add_action('init', static function () {
    if (plugency_dev_help_can_view() && plugency_dev_help_is_heartbeat_request()) {
        $GLOBALS['plugency_heartbeat_start'] = microtime(true);
    }
});

add_filter('heartbeat_received', static function ($response, $data, $screen_id) {
    if (plugency_dev_help_can_view() && plugency_dev_help_is_heartbeat_request()) {
        plugency_dev_help_record_heartbeat(is_array($data) ? $data : array(), is_string($screen_id) ? $screen_id : '');
    }
    return $response;
}, 999, 3);

add_filter('heartbeat_settings', static function ($settings) {
    $config = plugency_dev_help_get_heartbeat_settings();
    $type = plugency_dev_help_heartbeat_page_type();
    if (!isset($settings['interval']) || !is_numeric($settings['interval'])) {
        $settings['interval'] = 15;
    }
    if ($config['disable_dashboard'] && $type === 'dashboard') {
        $settings['interval'] = 120;
        $settings['suspend'] = 'dashboard';
        return $settings;
    }
    if ($config['disable_list_screens'] && $type === 'list') {
        $settings['interval'] = 120;
        $settings['suspend'] = 'list';
        return $settings;
    }
    if (isset($config['intervals'][$type])) {
        $settings['interval'] = max(1, (int) $config['intervals'][$type]);
    }
    return $settings;
}, 20);

function plugency_dev_help_allowed_security_headers(): array
{
    return array(
        'strict-transport-security',
        'content-security-policy',
        'x-content-type-options',
        'x-frame-options',
        'referrer-policy',
        'permissions-policy',
        'cross-origin-resource-policy',
        'cross-origin-opener-policy',
        'cross-origin-embedder-policy',
        'x-xss-protection',
        'x-permitted-cross-domain-policies',
        'expect-ct',
        'content-security-policy-report-only',
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'cache-control',
        'pragma',
        'expires',
        'content-encoding',
        'vary',
        'accept-encoding',
    );
}

function plugency_dev_help_normalize_header_name(string $name): string
{
    $parts = array_map(static function ($part) {
        return ucwords(strtolower($part));
    }, explode('-', trim($name)));
    return implode('-', $parts);
}

function plugency_dev_help_default_security_headers(): array
{
    $headers = array(
        'Content-Security-Policy' => "default-src 'self'; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; connect-src *; frame-ancestors 'self'; upgrade-insecure-requests",
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'SAMEORIGIN',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        'Cross-Origin-Resource-Policy' => 'same-origin',
        'Cross-Origin-Opener-Policy' => 'same-origin',
        'X-XSS-Protection' => '1; mode=block',
        'X-Permitted-Cross-Domain-Policies' => 'none',
        'Expect-CT' => 'max-age=86400, enforce',
    );

    if (is_ssl()) {
        $headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
    }

    return $headers;
}

function plugency_dev_help_sanitize_headers(array $headers): array
{
    $allowed = plugency_dev_help_allowed_security_headers();
    $clean = array();
    foreach ($headers as $name => $value) {
        $name = is_string($name) ? trim($name) : '';
        if ($name === '') {
            continue;
        }
        $key = strtolower($name);
        if (!in_array($key, $allowed, true)) {
            continue;
        }
        $value = is_array($value) ? implode(', ', array_map('strval', $value)) : (string) $value;
        $value = trim(substr($value, 0, 800));
        if ($value === '') {
            continue;
        }
        $normalized_name = plugency_dev_help_normalize_header_name($name);
        $clean[$normalized_name] = $value;
    }
    return $clean;
}

function plugency_dev_help_get_security_headers(): array
{
    $saved = get_option('plugency_dev_help_security_headers', array());
    if (!is_array($saved)) {
        $saved = array();
    }
    $headers = isset($saved['headers']) && is_array($saved['headers']) ? $saved['headers'] : array();
    $enabled = isset($saved['enabled']) ? (bool) $saved['enabled'] : false;
    $source = isset($saved['source']) ? sanitize_text_field((string) $saved['source']) : 'manual';
    $headers = plugency_dev_help_sanitize_headers($headers);
    return array(
        'enabled' => $enabled,
        'headers' => $headers,
        'source' => $source,
        'updated' => isset($saved['updated']) ? (int) $saved['updated'] : 0,
    );
}

function plugency_dev_help_save_security_headers(array $headers, bool $enabled = true, string $source = 'manual'): array
{
    $payload = array(
        'enabled' => $enabled,
        'headers' => plugency_dev_help_sanitize_headers($headers),
        'source' => sanitize_text_field($source),
        'updated' => time(),
    );
    update_option('plugency_dev_help_security_headers', $payload, false);
    return $payload;
}

function plugency_dev_help_get_response_headers(): array
{
    $headers = array();
    if (function_exists('headers_list')) {
        foreach (headers_list() as $line) {
            $parts = explode(':', (string) $line, 2);
            if (count($parts) === 2) {
                $headers[plugency_dev_help_normalize_header_name($parts[0])] = trim($parts[1]);
            }
        }
    }
    if (empty($headers) && function_exists('apache_response_headers')) {
        $apache = @apache_response_headers();
        if (is_array($apache)) {
            foreach ($apache as $name => $value) {
                $headers[plugency_dev_help_normalize_header_name($name)] = is_array($value) ? implode(', ', $value) : (string) $value;
            }
        }
    }
    return plugency_dev_help_clean_value($headers);
}

function plugency_dev_help_record_header_history(array $request_headers, array $response_headers): array
{
    $history = get_option('plugency_dev_help_header_history', array());
    if (!is_array($history)) {
        $history = array();
    }
    $entry = array(
        'time' => gmdate('c'),
        'uri' => isset($_SERVER['REQUEST_URI']) ? esc_url_raw((string) $_SERVER['REQUEST_URI']) : '',
        'hash' => md5(json_encode(array($response_headers, $request_headers))),
        'request_count' => count($request_headers),
        'response_count' => count($response_headers),
        'response' => plugency_dev_help_clean_value($response_headers),
        'request' => plugency_dev_help_clean_value($request_headers),
    );
    $last = isset($history[0]) ? $history[0] : null;
    $last_time = isset($last['time']) ? strtotime((string) $last['time']) : 0;
    if ($last && isset($last['hash']) && $last['hash'] === $entry['hash'] && $last_time && (time() - $last_time) < 300) {
        return $history;
    }
    array_unshift($history, $entry);
    if (count($history) > 12) {
        $history = array_slice($history, 0, 12);
    }
    update_option('plugency_dev_help_header_history', $history, false);
    return $history;
}

function plugency_dev_help_send_security_headers(): void
{
    $policy = plugency_dev_help_get_security_headers();
    if (empty($policy['enabled']) || empty($policy['headers']) || headers_sent()) {
        return;
    }
    $response_headers = array();
    if (function_exists('headers_list')) {
        foreach (headers_list() as $line) {
            $parts = explode(':', (string) $line, 2);
            if (count($parts) === 2) {
                $response_headers[plugency_dev_help_normalize_header_name($parts[0])] = trim($parts[1]);
            }
        }
    }
    foreach ($policy['headers'] as $name => $value) {
        if ($name === 'Strict-Transport-Security' && !is_ssl()) {
            continue;
        }
        if (isset($response_headers[$name]) && stripos((string) $response_headers[$name], (string) $value) !== false) {
            continue;
        }
        @header($name . ': ' . $value, true);
    }
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
            'isAdmin' => is_admin(),
            'isFrontend' => !is_admin(),
            'pageId' => function_exists('get_queried_object_id') ? (int) get_queried_object_id() : 0,
            'homeUrl' => home_url(),
            'budgets' => plugency_dev_help_get_budgets(),
        )
    );
}

add_action('wp_enqueue_scripts', 'plugency_dev_help_enqueue_assets');
add_action('admin_enqueue_scripts', 'plugency_dev_help_enqueue_assets');

add_action('init', static function () {
    $tests = plugency_dev_help_get_perf_tests();
    if (!empty($tests['schedules']) && !wp_next_scheduled('plugency_dev_help_perf_test_cron')) {
        wp_schedule_event(time() + MINUTE_IN_SECONDS, 'hourly', 'plugency_dev_help_perf_test_cron');
    }
});

add_action('init', static function () {
    if (plugency_dev_help_can_view()) {
        add_action('all', 'plugency_dev_help_register_hook_trace', 1, 1);
    }
});

add_action('send_headers', 'plugency_dev_help_send_security_headers', 20);

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

/**
 * Resolve a local filesystem path from a site URL (best-effort).
 */
function plugency_dev_help_resolve_local_path(string $url): array
{
    $site_host = wp_parse_url(home_url(), PHP_URL_HOST);
    $parsed = wp_parse_url($url);

    if (!$parsed || empty($parsed['path'])) {
        return array('path' => '', 'error' => 'Invalid URL.');
    }

    $host = isset($parsed['host']) ? $parsed['host'] : $site_host;
    if ($host && $site_host && strcasecmp((string) $host, (string) $site_host) !== 0) {
        return array('path' => '', 'error' => 'External URLs are not supported.');
    }

    $abs = trailingslashit(ABSPATH);
    $path = wp_normalize_path($abs . ltrim((string) $parsed['path'], '/'));
    if (strpos($path, wp_normalize_path($abs)) !== 0) {
        return array('path' => '', 'error' => 'Resolved path is outside WordPress root.');
    }

    if (!file_exists($path)) {
        return array('path' => '', 'error' => 'File not found locally.');
    }

    return array('path' => $path, 'error' => '');
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

    plugency_dev_help_record_coverage();

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

/**
 * Coverage tracking helpers.
 */
function plugency_dev_help_coverage_map(array $replace = null): array
{
    static $coverage = array();
    if (is_array($replace)) {
        $coverage = $replace;
    }
    return $coverage;
}

function plugency_dev_help_record_coverage(): void
{
    $frames = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 12);
    $map = plugency_dev_help_coverage_map();
    foreach ($frames as $depth => $frame) {
        if (empty($frame['function'])) {
            continue;
        }
        $func = $frame['function'];
        if (isset($frame['class'])) {
            $func = $frame['class'] . $frame['type'] . $func;
        }
        $file = isset($frame['file']) ? $frame['file'] : '';
        $key = md5($func . '|' . $file);
        if (!isset($map[$key])) {
            $map[$key] = array(
                'function' => $func,
                'file' => $file,
                'count' => 0,
                'max_depth' => 0,
                'last_seen' => microtime(true),
            );
        }
        $map[$key]['count']++;
        $map[$key]['max_depth'] = max($map[$key]['max_depth'], $depth);
        $map[$key]['last_seen'] = microtime(true);
    }
    plugency_dev_help_coverage_map($map);
}

function plugency_dev_help_flush_coverage(): array
{
    $current = plugency_dev_help_coverage_map();
    if (empty($current)) {
        return array();
    }
    $saved = get_option('plugency_dev_help_coverage', array());
    $merged = is_array($saved) ? $saved : array();
    foreach ($current as $key => $data) {
        if (!isset($merged[$key])) {
            $merged[$key] = $data;
            continue;
        }
        $merged[$key]['count'] += $data['count'];
        $merged[$key]['max_depth'] = max($merged[$key]['max_depth'], $data['max_depth']);
        $merged[$key]['last_seen'] = max($merged[$key]['last_seen'], $data['last_seen']);
    }
    uasort($merged, static function ($a, $b) {
        return ($b['count'] ?? 0) <=> ($a['count'] ?? 0);
    });
    $merged = array_slice($merged, 0, 400, true);
    update_option('plugency_dev_help_coverage', $merged, false);
    plugency_dev_help_coverage_map(array());
    return $merged;
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

function plugency_dev_help_transients_snapshot(array $queries = array()): array
{
    global $wpdb;
    $now = time();
    $table = $wpdb->options;
    $meta_table = is_multisite() ? $wpdb->sitemeta : '';

    $option_rows = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT option_name, option_value, autoload FROM {$table} WHERE option_name LIKE %s OR option_name LIKE %s",
            $wpdb->esc_like('_transient_') . '%',
            $wpdb->esc_like('_site_transient_') . '%'
        ),
        ARRAY_A
    );
    $timeout_rows = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT option_name, option_value FROM {$table} WHERE option_name LIKE %s OR option_name LIKE %s",
            $wpdb->esc_like('_transient_timeout_') . '%',
            $wpdb->esc_like('_site_transient_timeout_') . '%'
        ),
        ARRAY_A
    );

    $site_option_rows = array();
    $site_timeout_rows = array();
    if ($meta_table && is_multisite()) {
        $site_option_rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT meta_key AS option_name, meta_value AS option_value FROM {$meta_table} WHERE meta_key LIKE %s OR meta_key LIKE %s",
                $wpdb->esc_like('_site_transient_') . '%',
                $wpdb->esc_like('_transient_') . '%'
            ),
            ARRAY_A
        );
        $site_timeout_rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT meta_key AS option_name, meta_value AS option_value FROM {$meta_table} WHERE meta_key LIKE %s OR meta_key LIKE %s",
                $wpdb->esc_like('_site_transient_timeout_') . '%',
                $wpdb->esc_like('_transient_timeout_') . '%'
            ),
            ARRAY_A
        );
    }

    $option_rows = array_merge($option_rows, $site_option_rows);
    $timeout_rows = array_merge($timeout_rows, $site_timeout_rows);

    $timeouts = array();
    foreach ($timeout_rows as $row) {
        $timeouts[$row['option_name']] = (int) $row['option_value'];
    }

    $items = array();
    $total_bytes = 0;
    $expired_bytes = 0;
    $counts = array(
        'total' => 0,
        'expired' => 0,
        'orphan' => 0,
        'never_used' => 0,
        'site' => 0,
        'single' => 0,
    );

    $query_hits = 0;
    $query_writes = 0;
    $created = array();
    $read = array();
    foreach (is_array($queries) ? $queries : array() as $q) {
        $sql = isset($q['0']) ? strtolower((string) $q[0]) : '';
        if (strpos($sql, '_transient') === false) {
            continue;
        }
        if (strpos($sql, 'select') === 0) {
            $query_hits++;
            preg_match_all('/_transient[_a-z0-9]+/i', $sql, $matches);
            foreach ($matches[0] as $name) {
                $read[$name] = true;
            }
        } elseif (strpos($sql, 'insert') === 0 || strpos($sql, 'update') === 0 || strpos($sql, 'delete') === 0) {
            $query_writes++;
            preg_match_all('/_transient[_a-z0-9]+/i', $sql, $matches);
            foreach ($matches[0] as $name) {
                $created[$name] = true;
            }
        }
    }

    foreach ($option_rows as $row) {
        $name = isset($row['option_name']) ? (string) $row['option_name'] : '';
        if (strpos($name, '_transient_timeout_') !== false) {
            continue;
        }
        $is_site = strpos($name, '_site_transient_') === 0;
        $short = $is_site ? substr($name, strlen('_site_transient_')) : substr($name, strlen('_transient_'));
        $timeout_key = ($is_site ? '_site_transient_timeout_' : '_transient_timeout_') . $short;
        $expires = isset($timeouts[$timeout_key]) ? (int) $timeouts[$timeout_key] : null;
        $expired = $expires !== null && $expires > 0 && $expires < $now;
        $size = strlen((string) maybe_serialize($row['option_value']));
        $total_bytes += $size;
        if ($expired) {
            $expired_bytes += $size;
        }
        $status = $expired ? 'expired' : 'active';
        $orphan = !isset($timeouts[$timeout_key]) || $row['option_value'] === null;
        if ($orphan) {
            $status = 'orphan';
        }
        $source_guess = '';
        if (preg_match('/^([a-z0-9\-]+)/i', (string) $short, $m)) {
            $source_guess = $m[1];
        }

        $items[] = array(
            'name' => $short,
            'full_name' => $name,
            'type' => $is_site ? 'site' : 'single',
            'expires' => $expires,
            'expired' => $expired,
            'orphan' => $orphan,
            'size' => $size,
            'autoload' => isset($row['autoload']) ? $row['autoload'] : '',
            'status' => $status,
            'source' => $source_guess !== '' ? $source_guess : 'unknown',
            'never_used' => isset($created[$name]) && !isset($read[$name]),
        );
        $counts['total']++;
        $counts[$is_site ? 'site' : 'single']++;
        if ($expired) {
            $counts['expired']++;
        }
        if ($orphan) {
            $counts['orphan']++;
        }
        if (isset($created[$name]) && !isset($read[$name])) {
            $counts['never_used']++;
        }
    }

    $space = array(
        'total_bytes' => $total_bytes,
        'expired_bytes' => $expired_bytes,
        'expired_readable' => size_format((float) $expired_bytes),
        'total_readable' => size_format((float) $total_bytes),
    );

    return array(
        'items' => $items,
        'counts' => $counts,
        'space' => $space,
        'queries' => array(
            'hits' => $query_hits,
            'writes' => $query_writes,
        ),
        'summary' => array(
            'expired' => $counts['expired'],
            'orphan' => $counts['orphan'],
            'never_used' => $counts['never_used'],
        ),
    );
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
    $response_headers = plugency_dev_help_get_response_headers();
    $header_history = plugency_dev_help_record_header_history(isset($requests['HEADERS']) && is_array($requests['HEADERS']) ? $requests['HEADERS'] : array(), $response_headers);
    $security_policy = plugency_dev_help_get_security_headers();
    $opcache = plugency_dev_help_opcache_info();
    $cpt_info = plugency_dev_help_cpt_taxonomy_info();
    $heartbeat_log = get_option('plugency_dev_help_heartbeat_log', array());
    $heartbeat_log = is_array($heartbeat_log) ? $heartbeat_log : array();
    $heartbeat_settings = plugency_dev_help_get_heartbeat_settings();
    $heartbeat_recommended = plugency_dev_help_recommended_heartbeat_settings();
    $heartbeat_usage = plugency_dev_help_heartbeat_usage($heartbeat_log);
    $heartbeat_savings = plugency_dev_help_estimate_heartbeat_savings($heartbeat_log, $heartbeat_settings, $heartbeat_recommended);
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
    $coverage_recent = plugency_dev_help_flush_coverage();
    $coverage_saved = get_option('plugency_dev_help_coverage', array());
    $defined = get_defined_functions();
    $user_functions = isset($defined['user']) && is_array($defined['user']) ? $defined['user'] : array();
    $covered_names = array();
    foreach (is_array($coverage_saved) ? $coverage_saved : array() as $row) {
        if (isset($row['function'])) {
            $covered_names[$row['function']] = true;
        }
    }
    $unused_functions = array();
    foreach ($user_functions as $fn) {
        if (count($unused_functions) >= 100) {
            break;
        }
        if (!isset($covered_names[$fn])) {
            $unused_functions[] = $fn;
        }
    }

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
        'opcache' => $opcache,
        'heartbeat' => array(
            'log' => $heartbeat_log,
            'settings' => $heartbeat_settings,
            'recommended' => $heartbeat_recommended,
            'usage' => $heartbeat_usage,
            'savings' => $heartbeat_savings,
        ),
        'headers' => array(
            'request' => isset($requests['HEADERS']) ? $requests['HEADERS'] : array(),
            'response' => $response_headers,
            'history' => $header_history,
            'policy' => $security_policy,
            'recommended' => plugency_dev_help_default_security_headers(),
        ),
        'content_models' => $cpt_info,
        'transients' => plugency_dev_help_transients_snapshot($queries),
        'perf_tests' => plugency_dev_help_get_perf_tests(),
        'hooks' => array(
            'events' => is_array($hook_events) ? $hook_events : array(),
            'insights' => is_array($hook_insights) ? $hook_insights : array('total' => 0, 'slowest' => array(), 'max' => 0, 'threshold' => 0.05),
        ),
        'coverage' => array(
            'recent' => array_values($coverage_recent),
            'aggregate' => is_array($coverage_saved) ? array_values($coverage_saved) : array(),
            'unused' => $unused_functions,
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
    $is_frontend = !is_admin();
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
    <div class="plugency-debug-launcher" id="plugencyDebugLauncher" title="Open Plugency Debugger"><svg width="20" height="20" viewBox="0 0 0.6 0.6" xmlns="http://www.w3.org/2000/svg" fill="#fff">
            <path d="M.149.2a.3.3 0 0 0-.023.1H.05v.025h.075a.3.3 0 0 0 .015.1H.079L.045.518l.023.009L.096.45h.052c.03.075.087.125.151.125S.42.525.45.45h.052L.53.527.553.518.521.425H.46a.3.3 0 0 0 .015-.1H.55V.3H.474A.3.3 0 0 0 .451.2h.07L.555.107.532.098.504.175H.44A.2.2 0 0 0 .371.097L.434.034.416.016.347.085a.12.12 0 0 0-.095 0L.184.016.166.034l.063.063A.2.2 0 0 0 .16.175H.096L.068.098.045.107.079.2zM.3.1C.361.1.414.155.437.234a.32.32 0 0 0-.274 0C.186.155.239.1.3.1m0 .45A.1.1 0 0 1 .254.539L.3.3l.046.239A.1.1 0 0 1 .3.55M.369.525.317.254H.284L.231.525C.183.487.15.412.15.325A.3.3 0 0 1 .155.266L.164.261a.29.29 0 0 1 .271 0l.009.005A.3.3 0 0 1 .45.325c0 .087-.033.162-.081.2" />
            <path fill="none" d="M0 0h.6v.6H0z" />
        </svg></div>

    <div class="plugency-debug-panel" id="plugencyDebugPanel" aria-label="Plugency Developer Debugger">
        <div class="plugency-debug-header">
            <div class="plugency-header-left">
                <button type="button" class="plugency-button" data-action="start-inspect" title="Select element to inspect"><svg height="16" width="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0.48 0.48" xml:space="preserve" fill="#fff">
                        <path d="M.296.48.23.394.166.478l-.05-.34.32.144L.328.32l.064.086zM.232.328l.072.096.032-.026L.262.3.328.278.166.206.192.38zM.08.36H0V.28h.04v.04h.04zM.04.24H0V.12h.04zM.36.2H.32V.12h.04zm0-.12H.32V.04H.28V0h.08zm-.32 0H0V0h.08v.04H.04zm.2-.04H.12V0h.12z" />
                    </svg></button>
                <div>
                    <h2>Developer Debugger</h2>
                    <p>Focused snapshot of this request. Visible to administrators only.</p>
                </div>
            </div>
            <div class="plugency-debug-actions">
                <button type="button" class="plugency-button ghost" data-action="copy-snapshot"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9.167 7.5h7.5a1.667 1.667 0 0 1 1.666 1.667v7.5a1.667 1.667 0 0 1-1.666 1.666h-7.5A1.667 1.667 0 0 1 7.5 16.667v-7.5A1.667 1.667 0 0 1 9.167 7.5" />
                        <path d="M4.167 12.5h-.834a1.667 1.667 0 0 1-1.667-1.667v-7.5a1.667 1.667 0 0 1 1.667-1.667h7.5A1.667 1.667 0 0 1 12.5 3.333v.833" />
                    </svg></button>
                <button type="button" class="plugency-button ghost" data-action="download-snapshot"><svg width="16" height="16" viewBox="0 0 0.32 0.32" xmlns="http://www.w3.org/2000/svg" fill="#fff">
                        <path fill-rule="evenodd" d="M.28.18A.02.02 0 0 1 .3.2v.06A.04.04 0 0 1 .26.3h-.2A.04.04 0 0 1 .02.26V.2a.02.02 0 0 1 .04 0v.06h.2V.2A.02.02 0 0 1 .28.18M.16.02a.02.02 0 0 1 .02.02v.092L.206.106a.02.02 0 1 1 .028.028L.16.208.086.134A.02.02 0 0 1 .114.106L.14.132V.04A.02.02 0 0 1 .16.02" />
                    </svg></button>
                <button type="button" class="plugency-button ghost" data-action="open-filter" title="Filter view"><svg width="16" height="16" viewBox="-0.04 -0.04 0.48 0.48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin" class="jam jam-filter" fill="#fff">
                        <path d="m.042.04.13.162A.04.04 0 0 1 .18.227V.36L.22.33V.227A.04.04 0 0 1 .229.202L.358.04zm0-.04h.317A.04.04 0 0 1 .39.065L.26.227V.33a.04.04 0 0 1-.016.032l-.04.03A.04.04 0 0 1 .14.36V.227L.01.065A.04.04 0 0 1 .042 0" />
                    </svg></button>
                <button type="button" class="plugency-button solid" data-action="close-panel"><svg width="16" height="16" viewBox="0 0 0.32 0.32" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="#fff" d="M.256.086A.015.015 0 0 0 .235.065L.16.139.086.064a.015.015 0 0 0-.021.021L.139.16.065.234a.015.015 0 1 0 .021.021L.16.181l.074.074A.015.015 0 1 0 .255.234L.181.16z"/></svg></button>
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
                        <?php if (empty($filter_sources[$category_key])) {
                            continue;
                        } ?>
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
            <?php if ($is_frontend) : ?>
                <button data-tab="performance" role="tab" aria-selected="false">Performance</button>
            <?php endif; ?>
            <button data-tab="requests" role="tab" aria-selected="false">Requests</button>
            <button data-tab="context" role="tab" aria-selected="false">Context</button>
            <button data-tab="database" role="tab" aria-selected="false">Database</button>
            <button data-tab="api" role="tab" aria-selected="false">API Requests</button>
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
                                <span class="plugency-badge <?php echo is_admin() ? 'warn' : 'neutral'; ?>"><?php echo is_admin() ? 'Admin' : 'Front-end'; ?></span>
                                <div class="plugency-menu" data-role="request-menu">
                                    <button class="plugency-button ghost plugency-menu-toggle" type="button" data-action="toggle-request-menu" aria-haspopup="true" aria-expanded="false" aria-label="Request actions menu">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="#fff">
                                            <circle cx="3" cy="8" r="1.25" />
                                            <circle cx="8" cy="8" r="1.25" />
                                            <circle cx="13" cy="8" r="1.25" />
                                        </svg>
                                    </button>
                                    <div class="plugency-menu-items">
                                        <button class="plugency-button ghost" type="button" data-action="copy-curl"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.334 6h6a1.334 1.334 0 0 1 1.333 1.334v6a1.334 1.334 0 0 1-1.333 1.333h-6A1.334 1.334 0 0 1 6 13.334v-6A1.334 1.334 0 0 1 7.334 6"/><path d="M3.334 10h-.667a1.334 1.334 0 0 1-1.334-1.334v-6a1.334 1.334 0 0 1 1.334-1.334h6A1.334 1.334 0 0 1 10 2.666v.666"/></svg> Copy cURL</button>
                                        <button class="plugency-button ghost" type="button" data-action="replay-request"><svg width="16" height="16" viewBox="0 0 0.34 0.34" xmlns="http://www.w3.org/2000/svg" fill="#fff"><path d="M.12.16H0V.04h.02v.082a.157.157 0 0 1 .301.006L.302.133A.14.14 0 0 0 .17.032.14.14 0 0 0 .036.14H.12zm.1.02V.2h.084A.14.14 0 0 1 .17.307a.14.14 0 0 1-.132-.1L.019.212A.16.16 0 0 0 .17.327C.239.327.3.281.32.217V.3h.02V.18z"/></svg> Replay Request</button>
                                        <label class="plugency-inline-input">
                                            <span>Timeout</span>
                                            <input type="number" min="1" max="120" step="1" value="30" data-role="replay-timeout" aria-label="Replay timeout (seconds)">
                                            <span>s</span>
                                        </label>
                                    </div>
                                </div>
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
                            <?php if (empty($snapshot['files_by_source'][$category_key])) {
                                continue;
                            } ?>
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
                                <?php if (empty($snapshot['styles_by_source'][$category_key])) {
                                    continue;
                                } ?>
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
                                <?php if (empty($snapshot['scripts_by_source'][$category_key])) {
                                    continue;
                                } ?>
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
                                            <span title="<?php echo esc_attr($asset['src']); ?>">URL: <?php echo esc_html($asset['src']); ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php else : ?>
                            <p class="plugency-small">No asset sizes available.</p>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="plugency-card" data-role="preload-card">
                    <div class="plugency-card-header">
                        <h3>Preload & Prefetch recommendations</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="preload-meta">Not evaluated</span>
                            <button class="plugency-button ghost" type="button" data-action="run-preload-analysis">Analyze</button>
                            <button class="plugency-button ghost" type="button" data-action="export-preload-hints">Export hints</button>
                        </div>
                    </div>
                    <p class="plugency-small">Predict next pages, suggest preload/prefetch/preconnect hints, test strategies, and surface wasted preloads. Uses current asset inventory and recent navigation signals.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Navigation patterns</h4>
                            <div class="plugency-list" data-role="preload-nav">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Collecting recent navigation signals...</span>
                                </div>
                            </div>
                            <h4>Resource hints</h4>
                            <div class="plugency-pre compact" data-role="preload-hints">
                                <pre>Run analysis to generate preload/prefetch/preconnect hints.</pre>
                            </div>
                            <div class="plugency-inline-actions wrap">
                                <button class="plugency-button ghost" type="button" data-action="apply-preload-test">Start strategy test</button>
                                <button class="plugency-button ghost" type="button" data-action="stop-preload-test">Stop test</button>
                            </div>
                        </div>
                        <div>
                            <h4>Effectiveness dashboard</h4>
                            <ul class="plugency-meta">
                                <li><span>Predicted next pages</span><strong data-role="preload-next-count">0</strong></li>
                                <li><span>Hints generated</span><strong data-role="preload-hint-count">0</strong></li>
                                <li><span>Wasted preloads</span><strong data-role="preload-wasted">0</strong></li>
                                <li><span>Median saved ms</span><strong data-role="preload-saved">0</strong></li>
                            </ul>
                            <h4>Priority scoring</h4>
                            <div class="plugency-list" data-role="preload-priority">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Waiting for analysis...</span>
                                </div>
                            </div>
                            <h4>Implementation code</h4>
                            <div class="plugency-pre compact" data-role="preload-code">
                                <pre>Link hints will appear here after analysis.</pre>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="critical-css-card">
                    <div class="plugency-card-header">
                        <h3>Critical CSS</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="critical-css-meta">Awaiting analysis</span>
                            <button class="plugency-button ghost" type="button" data-action="analyze-critical-css">Analyze above-the-fold</button>
                            <button class="plugency-button ghost" type="button" data-action="copy-critical-inline" disabled>Copy inline</button>
                            <button class="plugency-button ghost" type="button" data-action="copy-critical-external" disabled>Copy external</button>
                            <button class="plugency-button ghost" type="button" data-action="copy-critical-head" disabled>Copy wp_head</button>
                        </div>
                    </div>
                    <p class="plugency-small" data-role="critical-css-status">Detects visible content, extracts only the CSS needed for first paint, and suggests defer candidates.</p>
                    <ul class="plugency-meta" data-role="critical-css-stats">
                        <li><span>Original CSS</span><strong data-role="critical-css-original">-</strong></li>
                        <li><span>Critical CSS</span><strong data-role="critical-css-critical">-</strong></li>
                        <li><span>Savings</span><strong data-role="critical-css-savings">-</strong></li>
                        <li><span>Est. LCP improvement</span><strong data-role="critical-css-lcp">-</strong></li>
                    </ul>
                    <div class="plugency-pre compact" data-role="critical-css-output">
                        <pre>Run the analyzer to extract critical CSS for this view.</pre>
                    </div>
                    <h4>Defer these CSS files</h4>
                    <div class="plugency-list" data-role="critical-css-defer-list">
                        <div class="plugency-list-item">
                            <span class="plugency-source">No analysis yet.</span>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="render-blocking-card">
                    <div class="plugency-card-header">
                        <h3>Render-blocking optimizer</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="render-blocking-meta">Scanning...</span>
                            <button class="plugency-button ghost" type="button" data-action="render-blocking-simulate">Simulate</button>
                            <button class="plugency-button ghost" type="button" data-action="render-blocking-apply">Apply (this page)</button>
                            <button class="plugency-button ghost" type="button" data-action="render-blocking-export">Export code</button>
                        </div>
                    </div>
                    <p class="plugency-small">Inventory render-blocking CSS/JS, inline critical CSS, defer/preload non-critical assets, and preview impact.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Blocking resources</h4>
                            <div class="plugency-list" data-role="render-blocking-list">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Collecting render-blocking assets...</span>
                                </div>
                            </div>
                            <h4>Strategy simulator</h4>
                            <div class="plugency-pre compact" data-role="render-blocking-sim">
                                <pre>Run simulation to see predicted savings, CLS impact, and strategy steps.</pre>
                            </div>
                        </div>
                        <div>
                            <h4>Optimized loading code</h4>
                            <div class="plugency-pre compact" data-role="render-blocking-code">
                                <pre>Code snippets will appear here.</pre>
                            </div>
                            <h4>Progressive enhancement & fallbacks</h4>
                            <div class="plugency-list" data-role="render-blocking-recos">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Recommendations pending analysis.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="heartbeat-card">
                    <div class="plugency-card-header">
                        <h3>Heartbeat monitor</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="heartbeat-meta">Idle</span>
                            <button class="plugency-button ghost" type="button" data-action="apply-heartbeat-recommended">Apply recommended</button>
                            <button class="plugency-button ghost" type="button" data-action="save-heartbeat-settings">Save</button>
                        </div>
                    </div>
                    <p class="plugency-small">Tracks WordPress Heartbeat frequency, payloads, and plugins using it. Tune per-page intervals and measure server load savings.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Timeline</h4>
                            <div class="plugency-list" data-role="heartbeat-timeline">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Waiting for heartbeat traffic...</span>
                                </div>
                            </div>
                            <div class="plugency-inline-actions wrap">
                                <button class="plugency-button ghost" type="button" data-action="start-heartbeat-test">Start A/B test</button>
                                <button class="plugency-button ghost" type="button" data-action="stop-heartbeat-test">Stop A/B test</button>
                            </div>
                        </div>
                        <div>
                            <h4>Controls</h4>
                            <div class="plugency-grid two">
                                <label class="plugency-inline-input">
                                    <span>Frontend interval (s)</span>
                                    <input type="number" min="1" data-heartbeat-key="frontend" value="60">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Admin interval (s)</span>
                                    <input type="number" min="1" data-heartbeat-key="admin" value="30">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Post edit interval (s)</span>
                                    <input type="number" min="1" data-heartbeat-key="post_edit" value="15">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Disable dashboard</span>
                                    <select data-heartbeat-toggle="disable_dashboard">
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Disable list screens</span>
                                    <select data-heartbeat-toggle="disable_list_screens">
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </label>
                                <label class="plugency-inline-input">
                                    <span>A/B Variant A (s)</span>
                                    <input type="number" min="1" data-heartbeat-ab="variant_a" value="30">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>A/B Variant B (s)</span>
                                    <input type="number" min="1" data-heartbeat-ab="variant_b" value="60">
                                </label>
                            </div>
                            <div class="plugency-pre compact" data-role="heartbeat-impact">
                                <pre>Calculating server impact...</pre>
                            </div>
                            <h4>Plugin usage</h4>
                            <div class="plugency-list" data-role="heartbeat-usage">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">No plugin signals yet.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="opcache-card">
                    <div class="plugency-card-header">
                        <h3>OPcache</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="opcache-meta">Inspecting...</span>
                            <button class="plugency-button ghost" type="button" data-action="clear-opcache">Clear cache</button>
                        </div>
                    </div>
                    <p class="plugency-small">View OPcache statistics, memory usage, hit rates, cached scripts, and suggested config for optimal performance.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Stats & trends</h4>
                            <ul class="plugency-meta">
                                <li><span>Enabled</span><strong data-role="opcache-enabled">-</strong></li>
                                <li><span>Hit rate</span><strong data-role="opcache-hit-rate">-</strong></li>
                                <li><span>Memory used</span><strong data-role="opcache-mem-used">-</strong></li>
                                <li><span>Fragmentation</span><strong data-role="opcache-frag">-</strong></li>
                            </ul>
                            <div class="plugency-chart" data-role="opcache-trend-wrapper">
                                <canvas width="520" height="140" data-role="opcache-trend"></canvas>
                            </div>
                            <div class="plugency-pre compact" data-role="opcache-config">
                                <pre>Loading OPcache configuration...</pre>
                            </div>
                        </div>
                        <div>
                            <h4>Cached scripts</h4>
                            <div class="plugency-list" data-role="opcache-scripts">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Gathering cached scripts...</span>
                                </div>
                            </div>
                            <h4>Not cached (included)</h4>
                            <div class="plugency-list" data-role="opcache-missed">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">None detected yet.</span>
                                </div>
                            </div>
                            <h4>Suggestions</h4>
                            <div class="plugency-list" data-role="opcache-suggestions">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Evaluating config...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <?php if ($is_frontend) : ?>
                <div class="plugency-section" data-section="performance">
                    <div class="plugency-grid two">
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Page Performance</h3>
                                <span class="plugency-badge neutral" data-role="perf-badge">Front-end</span>
                            </div>
                            <p class="plugency-small">Live front-end timings and resource sizes to spot bottlenecks.</p>
                            <ul class="plugency-meta">
                                <li><span>DOMContentLoaded</span><strong data-role="perf-dom">Measuring...</strong></li>
                                <li><span>Load event</span><strong data-role="perf-load">Measuring...</strong></li>
                                <li><span>TTFB</span><strong data-role="perf-ttfb">Measuring...</strong></li>
                                <li><span>Transfer</span><strong data-role="perf-transfer">Measuring...</strong></li>
                            </ul>
                            <p class="plugency-small" data-role="perf-note">Powered by the browser Performance API; cached responses may show 0 bytes.</p>
                            <div class="plugency-inline-actions wrap">
                                <button class="plugency-button ghost" type="button" data-action="copy-perf-report">Copy perf report</button>
                                <button class="plugency-button ghost" type="button" data-action="purge-page-cache">Purge page cache</button>
                                <button class="plugency-button ghost" type="button" data-action="toggle-defer-js">Toggle defer JS</button>
                            </div>
                        </div>
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Findings</h3>
                                <span class="plugency-badge neutral" data-role="perf-opps-count">Scanning...</span>
                            </div>
                            <div class="plugency-list" data-role="perf-opps">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Collecting signals...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="plugency-card" data-role="perf-budget-card">
                        <div class="plugency-card-header">
                            <h3>Performance budgets</h3>
                            <span class="plugency-badge neutral" data-role="perf-budget-status">Not evaluated</span>
                        </div>
                        <p class="plugency-small" data-role="perf-budget-note">Set thresholds for key metrics. We’ll alert and log when budgets are exceeded.</p>
                        <div class="plugency-grid two">
                            <label class="plugency-inline-input">
                                <span>LCP (ms)</span>
                                <input type="number" min="0" data-budget-key="lcp_ms" value="0">
                            </label>
                            <label class="plugency-inline-input">
                                <span>FID (ms)</span>
                                <input type="number" min="0" data-budget-key="fid_ms" value="0">
                            </label>
                            <label class="plugency-inline-input">
                                <span>CLS</span>
                                <input type="number" min="0" step="0.01" data-budget-key="cls" value="0">
                            </label>
                            <label class="plugency-inline-input">
                                <span>Total weight (KB)</span>
                                <input type="number" min="0" data-budget-key="weight_kb" value="0">
                            </label>
                            <label class="plugency-inline-input">
                                <span>Requests</span>
                                <input type="number" min="0" data-budget-key="requests" value="0">
                            </label>
                        </div>
                        <div class="plugency-inline-actions wrap">
                            <button class="plugency-button ghost" type="button" data-action="save-budgets">Save budgets</button>
                            <button class="plugency-button ghost" type="button" data-action="load-budgets">Reload</button>
                            <button class="plugency-button ghost" type="button" data-action="reset-budgets">Reset defaults</button>
                        </div>
                        <h4>Budget progress</h4>
                        <div class="plugency-list" data-role="perf-budget-bars">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Run a performance scan to populate budgets.</span>
                            </div>
                        </div>
                        <h4>Alerts & recommendations</h4>
                    <div class="plugency-list" data-role="perf-budget-alerts">
                        <div class="plugency-list-item">
                            <span class="plugency-source">No alerts yet.</span>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="perf-monitor-card">
                    <div class="plugency-card-header">
                        <h3>Automated performance monitoring</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="perf-monitor-meta">Idle</span>
                            <button class="plugency-button ghost" type="button" data-action="perf-monitor-run">Run now</button>
                            <button class="plugency-button ghost" type="button" data-action="perf-monitor-export">Export</button>
                        </div>
                    </div>
                    <p class="plugency-small">Schedules page tests, tracks Core Web Vitals/Lighthouse-style signals over time, and alerts on regressions or budget breaches.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Schedules</h4>
                            <div class="plugency-inline-actions wrap">
                                <input type="url" class="plugency-input" data-role="perf-monitor-url" placeholder="https://example.com/checkout">
                                <select data-role="perf-monitor-frequency">
                                    <option value="15m">15m</option>
                                    <option value="hourly">Hourly</option>
                                    <option value="6h">6 hours</option>
                                    <option value="daily" selected>Daily</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                                <select data-role="perf-monitor-profile">
                                    <option value="desktop">Desktop / 4G</option>
                                    <option value="mobile">Mobile / 3G</option>
                                    <option value="slow">Budget / slow 3G</option>
                                </select>
                                <button class="plugency-button ghost" type="button" data-action="perf-monitor-add">Add</button>
                            </div>
                            <h4>Plugin update pre-check</h4>
                            <div class="plugency-inline-actions wrap">
                                <input type="text" class="plugency-input" data-role="perf-monitor-plugin" placeholder="plugin-slug or name">
                                <button class="plugency-button ghost" type="button" data-action="perf-monitor-plugin-check">Baseline before activation</button>
                            </div>
                            <div class="plugency-list" data-role="perf-monitor-schedules">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">No schedules yet. Add a URL and cadence.</span>
                                </div>
                            </div>
                            <h4>Regression alerts</h4>
                            <div class="plugency-list" data-role="perf-monitor-alerts">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">No regressions detected.</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4>Performance timeline</h4>
                            <div class="plugency-chart" data-role="perf-monitor-chart-wrapper">
                                <canvas width="560" height="140" data-role="perf-monitor-chart"></canvas>
                            </div>
                            <h4>Latest runs</h4>
                            <div class="plugency-list" data-role="perf-monitor-latest">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Run a test to see vitals.</span>
                                </div>
                            </div>
                            <h4>History</h4>
                            <div class="plugency-list" data-role="perf-monitor-history">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">History will appear here.</span>
                                </div>
                            </div>
                            <div class="plugency-inline-input">
                                <span>Webhook (external monitor)</span>
                                <input type="url" data-role="perf-monitor-webhook" placeholder="https://monitor.example.com/hook">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="memory-profiler-card">
                    <div class="plugency-card-header">
                        <h3>Memory profiler</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="memory-status">Idle</span>
                            <button class="plugency-button ghost" type="button" data-action="start-memory-profile">Start</button>
                            <button class="plugency-button ghost" type="button" data-action="stop-memory-profile" disabled>Stop</button>
                            <button class="plugency-button ghost" type="button" data-action="export-memory-profile" disabled>Export snapshot</button>
                        </div>
                    </div>
                    <p class="plugency-small" data-role="memory-note">Tracks JS heap, DOM churn, listeners, globals, and detached nodes to flag leaks.</p>
                    <ul class="plugency-meta">
                        <li><span>JS heap used</span><strong data-role="memory-heap-used">n/a</strong></li>
                        <li><span>JS heap total</span><strong data-role="memory-heap-total">n/a</strong></li>
                        <li><span>DOM nodes</span><strong data-role="memory-dom-count">n/a</strong></li>
                        <li><span>Event listeners</span><strong data-role="memory-listener-count">n/a</strong></li>
                        <li><span>Globals</span><strong data-role="memory-global-count">n/a</strong></li>
                    </ul>
                    <div class="plugency-chart" data-role="memory-chart-wrapper">
                        <canvas width="560" height="140" data-role="memory-chart"></canvas>
                    </div>
                    <h4>Suspicious objects</h4>
                    <div class="plugency-table-wrapper">
                        <table class="plugency-table" data-role="memory-suspect-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Details</th>
                                    <th>Seen</th>
                                    <th>Retention</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td colspan="4">No suspects yet. Start profiling and interact with the page.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <h4>Leak recommendations</h4>
                    <div class="plugency-list" data-role="memory-recommendations">
                        <div class="plugency-list-item">
                            <span class="plugency-source">Awaiting profiling data.</span>
                        </div>
                    </div>
                </div>
                <div class="plugency-grid two">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Advanced Signals</h3>
                            <span class="plugency-badge neutral">Live</span>
                            </div>
                            <ul class="plugency-meta">
                                <li><span>First Paint</span><strong data-role="perf-fp">Measuring...</strong></li>
                                <li><span>First Contentful Paint</span><strong data-role="perf-fcp">Measuring...</strong></li>
                                <li><span>Largest Contentful Paint</span><strong data-role="perf-lcp">Measuring...</strong></li>
                                <li><span>Cumulative Layout Shift</span><strong data-role="perf-cls">Measuring...</strong></li>
                                <li><span>Main-thread long tasks</span><strong data-role="perf-longtasks">Measuring...</strong></li>
                                <li><span>DOM size</span><strong data-role="perf-dom-nodes">Measuring...</strong></li>
                                <li><span>Third-party requests</span><strong data-role="perf-third">Measuring...</strong></li>
                                <li><span>Largest resource</span><strong data-role="perf-largest">Measuring...</strong></li>
                            </ul>
                        </div>
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Slow resources</h3>
                                <span class="plugency-badge neutral" data-role="perf-slow-count">Scanning...</span>
                            </div>
                            <div class="plugency-list" data-role="perf-slow-resources">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Looking for slow requests...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="plugency-grid two">
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Blocking assets</h3>
                                <span class="plugency-badge neutral" data-role="perf-blocking-count">Scanning...</span>
                            </div>
                            <div class="plugency-list" data-role="perf-blocking-list">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Measuring render-blocking assets...</span>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card" data-role="a11y-card">
                            <div class="plugency-card-header">
                                <h3>Accessibility audit</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral" data-role="a11y-score">Score --</span>
                                    <button class="plugency-button ghost" type="button" data-action="run-a11y-audit">Run audit</button>
                                    <button class="plugency-button ghost" type="button" data-action="fix-a11y-common" disabled>Fix common</button>
                                    <button class="plugency-button ghost" type="button" data-action="export-a11y-report" disabled>Export</button>
                                </div>
                            </div>
                            <p class="plugency-small">WCAG 2.1 checks: contrast, ARIA/roles, alt text, headings, keyboard/focus, motion, forms. Click an issue to highlight the element.</p>
                            <div class="plugency-list" data-role="a11y-issues">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Awaiting audit...</span>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card" data-role="form-ux-card">
                            <div class="plugency-card-header">
                                <h3>Form UX & Performance</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral" data-role="form-meta">Tracking...</span>
                                    <button class="plugency-button ghost" type="button" data-action="export-form-report">Export</button>
                                </div>
                            </div>
                            <p class="plugency-small">Tracks form abandonment, slow/problem fields, validation friction, accessibility gaps, spam signals, and A/B variants.</p>
                            <div class="plugency-grid two">
                                <div>
                                    <h4>Interaction heatmap</h4>
                                    <div class="plugency-list" data-role="form-heatmap">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Waiting for form interactions...</span>
                                        </div>
                                    </div>
                                    <h4>Abandonment funnel</h4>
                                    <div class="plugency-chart" data-role="form-funnel-wrapper">
                                        <canvas width="520" height="120" data-role="form-funnel"></canvas>
                                    </div>
                                    <h4>Validation errors</h4>
                                    <div class="plugency-chart" data-role="form-validation-wrapper">
                                        <canvas width="520" height="120" data-role="form-validation"></canvas>
                                    </div>
                                </div>
                                <div>
                                    <h4>Field analytics</h4>
                                    <ul class="plugency-meta">
                                        <li><span>Abandonment</span><strong data-role="form-abandon-rate">-</strong></li>
                                        <li><span>Success rate</span><strong data-role="form-success-rate">-</strong></li>
                                        <li><span>Avg load time</span><strong data-role="form-load-time">-</strong></li>
                                        <li><span>Spam detected</span><strong data-role="form-spam">-</strong></li>
                                    </ul>
                                    <h4>Recommendations</h4>
                                    <div class="plugency-list" data-role="form-recos">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Collecting signals...</span>
                                        </div>
                                    </div>
                                    <h4>A/B testing</h4>
                                    <div class="plugency-inline-actions wrap">
                                        <button class="plugency-button ghost" type="button" data-action="assign-form-variant">Assign variant</button>
                                        <button class="plugency-button ghost" type="button" data-action="clear-form-variant">Reset variant</button>
                                        <span class="plugency-badge neutral" data-role="form-variant">Variant: -</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card" data-role="schema-card">
                            <div class="plugency-card-header">
                                <h3>Schema.org markup</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral" data-role="schema-meta">Validating...</span>
                                    <button class="plugency-button ghost" type="button" data-action="schema-validate">Validate</button>
                                    <button class="plugency-button ghost" type="button" data-action="schema-export">Export</button>
                                </div>
                            </div>
                            <p class="plugency-small">Scan existing structured data, validate JSON-LD, suggest templates, and preview rich results.</p>
                            <div class="plugency-grid two">
                                <div>
                                    <h4>Detected markup</h4>
                                    <div class="plugency-list" data-role="schema-list">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Scanning page for JSON-LD...</span>
                                        </div>
                                    </div>
                                    <h4>Error / warning details</h4>
                                    <div class="plugency-list" data-role="schema-errors">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">No validation run yet.</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h4>Live editor</h4>
                                    <textarea class="plugency-textarea" rows="8" data-role="schema-editor" placeholder='{"@context":"https://schema.org","@type":"Article"}'></textarea>
                                    <div class="plugency-inline-actions wrap">
                                        <select data-role="schema-template">
                                            <option value="">Select template</option>
                                            <option value="Article">Article</option>
                                            <option value="Product">Product</option>
                                            <option value="Organization">Organization</option>
                                            <option value="Person">Person</option>
                                            <option value="Event">Event</option>
                                        </select>
                                        <button class="plugency-button ghost" type="button" data-action="schema-apply-template">Insert template</button>
                                        <button class="plugency-button ghost" type="button" data-action="schema-preview">Preview rich result</button>
                                    </div>
                                    <div class="plugency-pre compact" data-role="schema-preview">
                                        <pre>Preview will appear here.</pre>
                                    </div>
                                    <div class="plugency-pre compact" data-role="schema-templates">
                                        <pre>Templates will be inserted into the editor for editing/validation.</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card" data-role="pwa-card">
                            <div class="plugency-card-header">
                                <h3>PWA & Service Worker</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral" data-role="pwa-meta">Checking...</span>
                                    <button class="plugency-button ghost" type="button" data-action="pwa-refresh">Refresh</button>
                                    <button class="plugency-button ghost" type="button" data-action="pwa-offline-toggle">Simulate offline</button>
                                </div>
                            </div>
                            <p class="plugency-small">Monitor service worker lifecycle, caches, manifest, push registration, and PWA requirements.</p>
                            <div class="plugency-grid two">
                                <div>
                                    <h4>Service worker & caches</h4>
                                    <div class="plugency-list" data-role="pwa-sw-status">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Checking service worker...</span>
                                        </div>
                                    </div>
                                    <h4>Cache inspector</h4>
                                    <div class="plugency-list" data-role="pwa-cache-list">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Loading cache entries...</span>
                                        </div>
                                    </div>
                                    <div class="plugency-inline-actions wrap">
                                        <button class="plugency-button ghost" type="button" data-action="pwa-clear-cache">Clear caches</button>
                                        <button class="plugency-button ghost" type="button" data-action="pwa-check-updates">Check SW update</button>
                                    </div>
                                </div>
                                <div>
                                    <h4>PWA checklist</h4>
                                    <div class="plugency-list" data-role="pwa-checklist">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Validating manifest, HTTPS, service worker...</span>
                                        </div>
                                    </div>
                                    <h4>Push & background sync</h4>
                                    <div class="plugency-pre compact" data-role="pwa-push">
                                        <pre>Push registration status will appear here. Use this to verify push and background sync support.</pre>
                                    </div>
                                    <h4>Install / Rich results</h4>
                                    <div class="plugency-pre compact" data-role="pwa-install">
                                        <pre>App install prompt state and display mode will appear here.</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Fonts</h3>
                                <span class="plugency-badge neutral" data-role="perf-fonts-meta">Scanning...</span>
                            </div>
                            <div class="plugency-list" data-role="perf-fonts-list">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Collecting font usage...</span>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card" data-role="font-optimizer-card">
                            <div class="plugency-card-header">
                                <h3>Web font optimization</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral" data-role="font-opt-meta">Analyzing...</span>
                                    <button class="plugency-button ghost" type="button" data-action="font-opt-simulate">Simulate</button>
                                    <button class="plugency-button ghost" type="button" data-action="font-opt-apply">Apply (this page)</button>
                                    <button class="plugency-button ghost" type="button" data-action="font-opt-export">Export CSS</button>
                                </div>
                            </div>
                            <p class="plugency-small">Inventory web fonts, detect FOIT/FOUT, suggest font-display, preloads, subsetting, and variable font alternatives.</p>
                            <div class="plugency-grid two">
                                <div>
                                    <h4>Fonts & usage</h4>
                                    <div class="plugency-list" data-role="font-opt-list">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Collecting fonts...</span>
                                        </div>
                                    </div>
                                    <h4>Loading strategy comparator</h4>
                                    <div class="plugency-pre compact" data-role="font-opt-strategy">
                                        <pre>Run simulation to compare current vs optimized load.</pre>
                                    </div>
                                </div>
                                <div>
                                    <h4>Recommendations</h4>
                                    <div class="plugency-list" data-role="font-opt-recos">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Evaluating font-display, preloads, and subsetting...</span>
                                        </div>
                                    </div>
                                    <h4>Optimized @font-face & preload</h4>
                                    <div class="plugency-pre compact" data-role="font-opt-code">
                                        <pre>CSS snippets will appear here.</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-card" data-role="wc-perf-card">
                            <div class="plugency-card-header">
                                <h3>WooCommerce Performance</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral" data-role="wc-perf-meta">Analyzing...</span>
                                    <button class="plugency-button ghost" type="button" data-action="wc-perf-refresh">Refresh</button>
                                    <button class="plugency-button ghost" type="button" data-action="wc-perf-export">Export</button>
                                </div>
                            </div>
                            <p class="plugency-small">Focuses on cart/checkout, product queries, variation performance, transients, and REST endpoints.</p>
                            <div class="plugency-grid two">
                                <div>
                                    <h4>Cart / checkout</h4>
                                    <div class="plugency-list" data-role="wc-cart-checkout">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Collecting cart/checkout signals...</span>
                                        </div>
                                    </div>
                                    <h4>Product queries & variations</h4>
                                    <div class="plugency-list" data-role="wc-query-list">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Analyzing product queries...</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h4>DB & cache</h4>
                                    <div class="plugency-list" data-role="wc-db-list">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Checking indexes, transients, and object cache...</span>
                                        </div>
                                    </div>
                                    <h4>Recommendations</h4>
                                    <div class="plugency-list" data-role="wc-recos">
                                        <div class="plugency-list-item">
                                            <span class="plugency-source">Evaluating WooCommerce-specific optimizations...</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="plugency-grid two">
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Compression & Cache</h3>
                                <span class="plugency-badge neutral" data-role="perf-cache-meta">Scanning...</span>
                            </div>
                            <div class="plugency-list" data-role="perf-cache-list">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Scanning responses...</span>
                                </div>
                            </div>
                        </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Third-party hosts</h3>
                            <span class="plugency-badge neutral" data-role="perf-third-meta">Scanning...</span>
                        </div>
                        <div class="plugency-list" data-role="perf-third-list">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Grouping third-party requests...</span>
                            </div>
                        </div>
                    </div>
                    <div class="plugency-card" data-role="third-party-governance">
                        <div class="plugency-card-header">
                            <h3>Third-party scripts</h3>
                            <div class="plugency-inline-actions wrap">
                                <span class="plugency-badge neutral" data-role="third-party-meta">Scanning...</span>
                                <button class="plugency-button ghost" type="button" data-action="export-third-report">Export</button>
                                <button class="plugency-button ghost" type="button" data-action="apply-facades">Apply facades</button>
                            </div>
                        </div>
                        <p class="plugency-small">Inventory, performance impact, privacy score, and load-strategy suggestions for external scripts.</p>
                        <h4>Performance & privacy</h4>
                        <div class="plugency-list" data-role="third-party-list">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Collecting external scripts...</span>
                            </div>
                        </div>
                        <h4>Load strategy</h4>
                        <div class="plugency-list" data-role="third-party-strategy">
                            <div class="plugency-list-item">
                                <span class="plugency-source">No strategy suggested yet.</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Heavy JS bundles</h3>
                        <span class="plugency-badge neutral" data-role="perf-js-meta">Scanning...</span>
                    </div>
                    <div class="plugency-list" data-role="perf-js-list">
                        <div class="plugency-list-item">
                            <span class="plugency-source">Inspecting scripts...</span>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="bundle-analyzer-card">
                    <div class="plugency-card-header">
                        <h3>JS Bundle Analysis</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="bundle-analyzer-meta">Scanning...</span>
                            <button class="plugency-button ghost" type="button" data-action="export-bundle-report">Export</button>
                        </div>
                    </div>
                    <p class="plugency-small">Treemap of script composition, duplicate detection, blocking flags, and size-saving estimates.</p>
                    <div class="plugency-chart" data-role="bundle-treemap-wrapper">
                        <canvas width="520" height="160" data-role="bundle-treemap"></canvas>
                    </div>
                    <h4>Findings</h4>
                    <div class="plugency-list" data-role="bundle-findings">
                        <div class="plugency-list-item">
                            <span class="plugency-source">Gathering bundle signals...</span>
                        </div>
                    </div>
                    <h4>Duplicates & unused code</h4>
                    <div class="plugency-list" data-role="bundle-duplicates">
                        <div class="plugency-list-item">
                            <span class="plugency-source">No data yet.</span>
                        </div>
                    </div>
                    <h4>Dependency graph</h4>
                    <div class="plugency-pre compact" data-role="bundle-deps">
                        <pre>Building dependency view...</pre>
                    </div>
                </div>
                <div class="plugency-grid two">
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Lazy-load candidates</h3>
                            <span class="plugency-badge neutral" data-role="perf-lazy-meta">Scanning...</span>
                        </div>
                        <div class="plugency-list" data-role="perf-lazy-list">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Looking for below-the-fold images...</span>
                            </div>
                        </div>
                    </div>
                    <div class="plugency-card">
                        <div class="plugency-card-header">
                            <h3>Connections & Redirects</h3>
                            <span class="plugency-badge neutral" data-role="perf-conn-meta">Scanning...</span>
                        </div>
                        <div class="plugency-list" data-role="perf-conn-list">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Evaluating DNS/connect/redirect...</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Layout risk (CLS)</h3>
                        <span class="plugency-badge neutral" data-role="perf-cls-meta">Scanning...</span>
                    </div>
                    <div class="plugency-list" data-role="perf-cls-list">
                        <div class="plugency-list-item">
                            <span class="plugency-source">Looking for un-sized media...</span>
                        </div>
                    </div>
                </div>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Media & Embeds</h3>
                        <span class="plugency-badge neutral" data-role="perf-embed-meta">Scanning...</span>
                    </div>
                    <div class="plugency-list" data-role="perf-embed-list">
                        <div class="plugency-list-item">
                            <span class="plugency-source">Scanning iframes/video...</span>
                        </div>
                    </div>
                </div>
                        <div class="plugency-card">
                            <div class="plugency-card-header">
                                <h3>Resource Analysis</h3>
                                <div class="plugency-inline-actions wrap">
                                    <span class="plugency-badge neutral">Front-end only</span>
                                    <button class="plugency-button ghost" type="button" data-action="optimize-all-images">Optimize all images</button>
                                    <button class="plugency-button ghost" type="button" data-action="preload-key-assets">Preload key assets</button>
                                    <button class="plugency-button ghost" type="button" data-action="lazyload-images">Add lazyload</button>
                                    <button class="plugency-button ghost" type="button" data-action="preconnect-hosts">Preconnect third-parties</button>
                                    <button class="plugency-button ghost" type="button" data-action="lazyload-embeds">Lazyload embeds</button>
                                    <button class="plugency-button ghost" type="button" data-action="boost-hero-image">Boost hero image</button>
                                </div>
                            </div>
                        <div class="plugency-accordion" data-role="perf-accordion">
                            <div class="plugency-accordion-item open" data-accordion="styles">
                                <button class="plugency-accordion-trigger" type="button" aria-expanded="true">
                                    <span>Styles</span>
                                        <span class="plugency-accordion-meta" data-role="perf-styles-meta">Loading...</span>
                                    </button>
                                    <div class="plugency-accordion-panel">
                                        <div class="plugency-list" data-role="perf-styles-list"></div>
                                    </div>
                                </div>
                                <div class="plugency-accordion-item" data-accordion="scripts">
                                    <button class="plugency-accordion-trigger" type="button" aria-expanded="false">
                                        <span>Scripts</span>
                                        <span class="plugency-accordion-meta" data-role="perf-scripts-meta">Loading...</span>
                                    </button>
                                    <div class="plugency-accordion-panel">
                                        <div class="plugency-list" data-role="perf-scripts-list"></div>
                                    </div>
                                </div>
                                <div class="plugency-accordion-item" data-accordion="images">
                                    <button class="plugency-accordion-trigger" type="button" aria-expanded="false">
                                        <span>Images</span>
                                        <span class="plugency-accordion-meta" data-role="perf-images-meta">Loading...</span>
                                    </button>
                                    <div class="plugency-accordion-panel">
                                        <div class="plugency-list" data-role="perf-images-list"></div>
                                    </div>
                                </div>
                                <div class="plugency-accordion-item" data-accordion="metrics">
                                    <button class="plugency-accordion-trigger" type="button" aria-expanded="false">
                                        <span>Network &amp; cache</span>
                                        <span class="plugency-accordion-meta" data-role="perf-metrics-meta">Loading...</span>
                                    </button>
                                    <div class="plugency-accordion-panel">
                                        <div class="plugency-list" data-role="perf-metrics-list"></div>
                                </div>
                    </div>
                </div>
            </div>
            <div class="plugency-modal-backdrop" data-role="image-optimizer-backdrop"></div>
            <div class="plugency-modal" data-role="image-optimizer-modal" aria-label="Image optimizer dialog" role="dialog" aria-modal="true">
                <div class="plugency-modal-header">
                    <div>
                        <h3>Image Optimizer</h3>
                        <p class="plugency-small" data-role="optimizer-summary">Select an image to see estimated savings.</p>
                    </div>
                    <button type="button" class="plugency-button ghost" data-action="close-image-optimizer">Close</button>
                </div>
                <div class="plugency-modal-body">
                    <div class="plugency-modal-preview">
                        <div class="plugency-preview-thumb" data-role="optimizer-thumb"></div>
                        <div class="plugency-preview-meta">
                            <p class="plugency-small" data-role="optimizer-meta"></p>
                            <p class="plugency-small" data-role="optimizer-path"></p>
                        </div>
                    </div>
                    <div class="plugency-modal-options">
                        <label class="plugency-check">
                            <input type="checkbox" data-option="resize_to_rendered" checked>
                            <span>Auto resize to rendered size</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="convert_webp" checked>
                            <span>Convert to WebP</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="convert_avif" checked>
                            <span>Convert to AVIF</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="generate_srcset" checked>
                            <span>Generate responsive srcset</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="add_lqip" checked>
                            <span>Add blur-up/LQIP placeholders</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="lazy_fallback" checked>
                            <span>Lazy load with IntersectionObserver fallback</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="update_db">
                            <span>Automatic update in the database</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="remove_original">
                            <span>Remove original after optimization (safe if DB updated)</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="lossless">
                            <span>Lossless optimization (higher quality)</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="backup_originals" checked>
                            <span>Create backups before writing optimized files</span>
                        </label>
                        <label class="plugency-check">
                            <input type="checkbox" data-option="detect_focal_point" checked>
                            <span>Auto-detect focal point for art direction crops</span>
                        </label>
                        <p class="plugency-small">Art direction breakpoints: <strong data-role="optimizer-breakpoints">480 / 768 / 1200</strong></p>
                        <p class="plugency-small" data-role="optimizer-estimate"></p>
                        <div class="plugency-progress" data-role="optimizer-progress" style="display:none;">
                            <div class="plugency-progress-bar" data-role="optimizer-progress-bar" style="width:0%;"></div>
                            <span class="plugency-progress-label" data-role="optimizer-progress-label"></span>
                        </div>
                        <div class="plugency-inline-actions wrap">
                            <button type="button" class="plugency-button solid" data-action="start-image-optimization">Proceed &amp; download</button>
                            <button type="button" class="plugency-button ghost" data-action="start-bulk-optimization">Run full pipeline</button>
                            <button type="button" class="plugency-button ghost" data-action="rollback-optimization" disabled>Rollback last run</button>
                            <a class="plugency-button ghost" href="#" target="_blank" rel="noopener" data-role="optimizer-download" style="display:none;">Download optimized bundle</a>
                        </div>
                        <div class="plugency-before-after">
                            <input type="range" min="0" max="100" value="50" data-role="optimizer-slider">
                            <div class="plugency-before-after-images">
                                <img data-role="optimizer-before" alt="Before" />
                                <img data-role="optimizer-after" alt="After" />
                            </div>
                        </div>
                        <p class="plugency-small" data-role="optimizer-lighthouse">Estimated Lighthouse improvement: -</p>
                        <p class="plugency-status" data-role="optimizer-status"></p>
                        <div class="plugency-pre compact" data-role="optimizer-results" style="display:none;"></div>
                    </div>
                </div>
                <div class="plugency-card" data-role="heartbeat-card">
                    <div class="plugency-card-header">
                        <h3>Heartbeat monitor</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="heartbeat-meta">Idle</span>
                            <button class="plugency-button ghost" type="button" data-action="apply-heartbeat-recommended">Apply recommended</button>
                            <button class="plugency-button ghost" type="button" data-action="save-heartbeat-settings">Save</button>
                        </div>
                    </div>
                    <p class="plugency-small">Tracks WordPress Heartbeat frequency, payloads, and plugins using it. Tune per-page intervals and measure server load savings.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Timeline</h4>
                            <div class="plugency-list" data-role="heartbeat-timeline">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Waiting for heartbeat traffic...</span>
                                </div>
                            </div>
                            <div class="plugency-inline-actions wrap">
                                <button class="plugency-button ghost" type="button" data-action="start-heartbeat-test">Start A/B test</button>
                                <button class="plugency-button ghost" type="button" data-action="stop-heartbeat-test">Stop A/B test</button>
                            </div>
                        </div>
                        <div>
                            <h4>Controls</h4>
                            <div class="plugency-grid two">
                                <label class="plugency-inline-input">
                                    <span>Frontend interval (s)</span>
                                    <input type="number" min="1" data-heartbeat-key="frontend" value="60">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Admin interval (s)</span>
                                    <input type="number" min="1" data-heartbeat-key="admin" value="30">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Post edit interval (s)</span>
                                    <input type="number" min="1" data-heartbeat-key="post_edit" value="15">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Disable dashboard</span>
                                    <select data-heartbeat-toggle="disable_dashboard">
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </label>
                                <label class="plugency-inline-input">
                                    <span>Disable list screens</span>
                                    <select data-heartbeat-toggle="disable_list_screens">
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </label>
                                <label class="plugency-inline-input">
                                    <span>A/B Variant A (s)</span>
                                    <input type="number" min="1" data-heartbeat-ab="variant_a" value="30">
                                </label>
                                <label class="plugency-inline-input">
                                    <span>A/B Variant B (s)</span>
                                    <input type="number" min="1" data-heartbeat-ab="variant_b" value="60">
                                </label>
                            </div>
                            <div class="plugency-pre compact" data-role="heartbeat-impact">
                                <pre>Calculating server impact...</pre>
                            </div>
                            <h4>Plugin usage</h4>
                            <div class="plugency-list" data-role="heartbeat-usage">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">No plugin signals yet.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    <?php endif; ?>

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
                    <div class="plugency-card" data-role="header-audit-card">
                        <div class="plugency-card-header">
                            <h3>Response header audit</h3>
                            <div class="plugency-inline-actions wrap">
                                <span class="plugency-badge neutral" data-role="header-score">Score: --</span>
                                <button class="plugency-button ghost" type="button" data-action="run-header-audit">Re-run</button>
                                <button class="plugency-button ghost" type="button" data-action="apply-security-headers">One-click secure</button>
                            </div>
                        </div>
                        <p class="plugency-small">Uses the live request headers above plus current response headers to score security, cache, compression, and CORS posture.</p>
                        <div class="plugency-grid two">
                            <div>
                                <h4>Scorecard</h4>
                                <ul class="plugency-meta" data-role="header-scorecard">
                                    <li><span>Security</span><strong data-role="header-score-security">-</strong></li>
                                    <li><span>Cache policy</span><strong data-role="header-score-cache">-</strong></li>
                                    <li><span>CORS</span><strong data-role="header-score-cors">-</strong></li>
                                    <li><span>Compression</span><strong data-role="header-score-compress">-</strong></li>
                                    <li><span>Disclosure</span><strong data-role="header-score-info">-</strong></li>
                                </ul>
                                <div class="plugency-list" data-role="header-issues">
                                    <div class="plugency-list-item">
                                        <span class="plugency-source">Waiting for audit...</span>
                                    </div>
                                </div>
                                <div class="plugency-inline-actions wrap">
                                    <button class="plugency-button ghost" type="button" data-action="export-header-report">Export</button>
                                    <button class="plugency-button ghost" type="button" data-action="save-header-policy">Save current headers</button>
                                </div>
                            </div>
                            <div>
                                <h4>Config generator</h4>
                                <div class="plugency-pre compact" data-role="header-config-htaccess">
                                    <pre>Generating .htaccess snippet...</pre>
                                </div>
                                <div class="plugency-pre compact" data-role="header-config-nginx">
                                    <pre>Generating Nginx snippet...</pre>
                                </div>
                                <div class="plugency-pre compact" data-role="header-config-php">
                                    <pre>Generating wp_head/wp_headers snippet...</pre>
                                </div>
                                <div class="plugency-inline-actions wrap">
                                    <button class="plugency-button ghost" type="button" data-action="copy-header-htaccess">Copy .htaccess</button>
                                    <button class="plugency-button ghost" type="button" data-action="copy-header-nginx">Copy Nginx</button>
                                    <button class="plugency-button ghost" type="button" data-action="copy-header-php">Copy PHP</button>
                                </div>
                            </div>
                        </div>
                        <div class="plugency-grid two">
                            <div>
                                <h4>History & change tracking</h4>
                                <div class="plugency-list" data-role="header-history">
                                    <div class="plugency-list-item">
                                        <span class="plugency-source">No history yet.</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4>Live checks</h4>
                                <div class="plugency-pre compact" data-role="header-summary">
                                    <pre>Checking cache, redundancy, and conflicts...</pre>
                                </div>
                                <div class="plugency-pre compact" data-role="header-cors">
                                    <pre>Testing CORS and compression...</pre>
                                </div>
                            </div>
                        </div>
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
                <div class="plugency-card" data-role="plugin-conflict-card">
                    <div class="plugency-card-header">
                        <h3>Plugin conflicts</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="plugin-conflict-meta">Scanning...</span>
                        <button class="plugency-button ghost" type="button" data-action="export-plugin-conflicts">Export</button>
                    </div>
                </div>
                <p class="plugency-small">Detects JS/CSS conflicts, duplicate libraries, and performance impact by plugin.</p>
                <div class="plugency-grid two">
                    <div>
                        <h4>Warnings</h4>
                        <div class="plugency-list" data-role="plugin-conflict-warnings">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Collecting signals...</span>
                            </div>
                        </div>
                        <h4>Duplicate libraries / blocking assets</h4>
                        <div class="plugency-list" data-role="plugin-duplicate-list">
                            <div class="plugency-list-item">
                                <span class="plugency-source">No data yet.</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4>Console / CSS conflicts</h4>
                        <div class="plugency-list" data-role="plugin-console-list">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Monitoring console errors...</span>
                            </div>
                        </div>
                        <div class="plugency-list" data-role="plugin-css-conflicts">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Scanning stylesheets...</span>
                            </div>
                        </div>
                        <h4>Compatibility matrix</h4>
                        <div class="plugency-pre compact" data-role="plugin-matrix">
                            <pre>Building matrix...</pre>
                        </div>
                    </div>
                </div>
                <div class="plugency-card" data-role="content-model-card">
                    <div class="plugency-card-header">
                        <h3>Content models (CPT & Taxonomies)</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="content-model-meta">Inventorying...</span>
                            <button class="plugency-button ghost" type="button" data-action="cleanup-unused-cpts">Cleanup unused</button>
                            <button class="plugency-button ghost" type="button" data-action="export-content-models">Export</button>
                        </div>
                    </div>
                    <p class="plugency-small">Lists custom post types and taxonomies with registrar, counts, REST/rewrite exposure, conflicts, and cleanup suggestions.</p>
                    <div class="plugency-grid two">
                        <div>
                            <h4>Post types</h4>
                            <div class="plugency-list" data-role="content-model-cpts">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Gathering CPTs...</span>
                                </div>
                            </div>
                            <h4>Taxonomies</h4>
                            <div class="plugency-list" data-role="content-model-taxes">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Gathering taxonomies...</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4>Conflicts & performance</h4>
                            <div class="plugency-pre compact" data-role="content-model-conflicts">
                                <pre>Checking rewrite conflicts and registrations...</pre>
                            </div>
                            <h4>Recommendations</h4>
                            <div class="plugency-list" data-role="content-model-recos">
                                <div class="plugency-list-item">
                                    <span class="plugency-source">Evaluating...</span>
                                </div>
                            </div>
                        </div>
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

            <div class="plugency-section" data-section="api">
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>API requests</h3>
                        <div class="plugency-inline-actions wrap">
                            <span class="plugency-badge neutral" data-role="api-status">Idle</span>
                            <button class="plugency-button ghost" type="button" data-action="export-api-log" disabled>Export</button>
                            <button class="plugency-button ghost" type="button" data-action="clear-api-log">Clear</button>
                            <button class="plugency-button ghost" type="button" data-action="toggle-mock-api">Mock off</button>
                        </div>
                    </div>
                    <div class="plugency-grid two">
                        <label class="plugency-inline-input">
                            <span>Endpoint</span>
                            <input type="text" data-role="api-filter-endpoint" placeholder="/wp-json/">
                        </label>
                        <label class="plugency-inline-input">
                            <span>Method</span>
                            <input type="text" data-role="api-filter-method" placeholder="GET/POST">
                        </label>
                        <label class="plugency-inline-input">
                            <span>Status</span>
                            <input type="text" data-role="api-filter-status" placeholder="200, 4xx">
                        </label>
                        <label class="plugency-inline-input">
                            <span>Response time ≥ ms</span>
                            <input type="number" min="0" data-role="api-filter-latency" placeholder="500">
                        </label>
                    </div>
                    <div class="plugency-chart" data-role="api-waterfall-wrapper">
                        <canvas width="520" height="140" data-role="api-waterfall"></canvas>
                    </div>
                    <h4>Requests</h4>
                    <div class="plugency-list" data-role="api-list">
                        <div class="plugency-list-item">
                            <span class="plugency-source">Waiting for traffic...</span>
                        </div>
                    </div>
                </div>
                <div class="plugency-card">
                    <div class="plugency-card-header">
                        <h3>Request details</h3>
                        <span class="plugency-badge neutral" data-role="api-detail-badge">Select a request</span>
                    </div>
                    <div class="plugency-pre compact" data-role="api-detail">
                        <pre>Select a request to view payloads, headers, timing, auth, and cURL.</pre>
                    </div>
                    <div class="plugency-inline-actions wrap">
                        <button class="plugency-button ghost" type="button" data-action="copy-api-curl" disabled>Copy cURL</button>
                        <button class="plugency-button ghost" type="button" data-action="replay-api" disabled>Replay</button>
                        <button class="plugency-button ghost" type="button" data-action="mock-api-response" disabled>Mock response</button>
                    </div>
                </div>
            </div>

            <div class="plugency-section" data-section="database">
                <div class="plugency-card">
                    <div class="plugency-query-layout">
                        <div class="plugency-query-nav-wrapper">
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
                                        data-query-tab="<?php echo esc_attr($key); ?>">
                                        <?php echo esc_html($label); ?>
                                    </button>
                                <?php endforeach; ?>
                            </div>
                            <div class="plugency-query-actions">
                                <label class="plugency-switch" data-role="query-view">
                                    <input type="checkbox" data-query-view-toggle>
                                    <span class="plugency-switch-slider" title="Toggle array/table view"></span>
                                    <span class="plugency-switch-label" data-query-view-label>Array</span>
                                </label>
                                <button class="plugency-button ghost" data-action="toggle-query-log"><?php echo defined('SAVEQUERIES') && SAVEQUERIES ? 'Disable Query Logging' : 'Enable Query Logging'; ?></button>
                            </div>
                        </div>
                        <div class="plugency-query-content" role="presentation">

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
                                        <div class="plugency-card flat" data-role="query-optimizer">
                                            <div class="plugency-card-header">
                                                <h4>Query optimizer</h4>
                                                <div class="plugency-inline-actions wrap">
                                                    <button class="plugency-button ghost" type="button" data-action="analyze-queries">Analyze queries</button>
                                                    <button class="plugency-button ghost" type="button" data-action="export-query-report" disabled>Export report</button>
                                                    <button class="plugency-button ghost" type="button" data-action="test-optimized-query" disabled>Test alternative</button>
                                                </div>
                                            </div>
                                            <p class="plugency-small" data-role="query-optimizer-note">Identify N+1 patterns, index opportunities, missing FKs, and plan changes from SAVEQUERIES.</p>
                                            <div class="plugency-chart" data-role="query-history-chart-wrapper">
                                                <canvas width="520" height="120" data-role="query-history-chart"></canvas>
                                            </div>
                                            <h4>Recommendations</h4>
                                            <div class="plugency-list" data-role="query-recommendations">
                                                <div class="plugency-list-item">
                                                    <span class="plugency-source">Run analysis to see optimization suggestions.</span>
                                                </div>
                                            </div>
                                            <h4>Execution plans</h4>
                                            <div class="plugency-table-wrapper">
                                                <table class="plugency-table" data-role="query-plan-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Query</th>
                                                            <th>Plan (before)</th>
                                                            <th>Plan (after)</th>
                                                            <th>Est. gain</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td colspan="4">No plans yet.</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div class="plugency-card flat" data-role="transient-card">
                                            <div class="plugency-card-header">
                                                <h4>Transient cache</h4>
                                                <div class="plugency-inline-actions wrap">
                                                    <span class="plugency-badge neutral" data-role="transient-badge">Loading...</span>
                                                    <button class="plugency-button ghost" type="button" data-action="cleanup-transients">Clean expired</button>
                                                    <button class="plugency-button ghost" type="button" data-action="export-transients">Export</button>
                                                </div>
                                            </div>
                                            <p class="plugency-small" data-role="transient-note">Active transients, expirations, orphaned entries, and space impact.</p>
                                            <div class="plugency-grid two">
                                                <label class="plugency-inline-input">
                                                    <span>Search</span>
                                                    <input type="text" data-role="transient-search" placeholder="transient name/source">
                                                </label>
                                                <div class="plugency-inline-input">
                                                    <span class="plugency-small">Space used</span>
                                                    <strong data-role="transient-space">-</strong>
                                                </div>
                                            </div>
                                            <div class="plugency-chart" data-role="transient-chart-wrapper">
                                                <canvas width="520" height="120" data-role="transient-chart"></canvas>
                                            </div>
                                            <h4>Inventory</h4>
                                            <div class="plugency-table-wrapper">
                                                <table class="plugency-table" data-role="transient-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Name</th>
                                                            <th>Status</th>
                                                            <th>Expires</th>
                                                            <th>Size</th>
                                                            <th>Source</th>
                                                            <th>Type</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td colspan="6">Loading transients...</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                            <h4>Recommendations</h4>
                                            <div class="plugency-list" data-role="transient-recommendations">
                                                <div class="plugency-list-item">
                                                    <span class="plugency-source">Insights will appear after scan.</span>
                                                </div>
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
                                                <tr>
                                                    <th>#</th>
                                                    <th>Query</th>
                                                    <th>Caller</th>
                                                    <th>Time (s)</th>
                                                </tr>
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
                                                <tr>
                                                    <th>Count</th>
                                                    <th>Query</th>
                                                    <th>Caller</th>
                                                    <th>Total Time (s)</th>
                                                </tr>
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
                                                <tr>
                                                    <th>Caller</th>
                                                    <th>Count</th>
                                                    <th>Total Time (s)</th>
                                                </tr>
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
                                                <tr>
                                                    <th>#</th>
                                                    <th>Query</th>
                                                    <th>Caller</th>
                                                    <th>Time (s)</th>
                                                </tr>
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
                                                <tr>
                                                    <th>#</th>
                                                    <th>Query</th>
                                                    <th>Caller</th>
                                                    <th>Time (s)</th>
                                                </tr>
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
                    <div class="plugency-card" data-role="coverage-card">
                        <div class="plugency-card-header">
                            <h3>Code coverage (runtime)</h3>
                            <div class="plugency-inline-actions wrap">
                                <span class="plugency-badge neutral" data-role="coverage-meta">Aggregated</span>
                                <button class="plugency-button ghost" data-action="export-coverage">Export</button>
                                <button class="plugency-button ghost" data-action="show-unused">Show unused</button>
                            </div>
                        </div>
                        <p class="plugency-small">Function-level execution counts collected from hooks instrumentation in this environment.</p>
                        <div class="plugency-grid two">
                            <div class="plugency-chart" data-role="coverage-heatmap-wrapper">
                                <canvas width="520" height="140" data-role="coverage-heatmap"></canvas>
                            </div>
                            <div class="plugency-pre compact" data-role="coverage-callgraph">
                                <pre>Call graph builds as hooks run.</pre>
                            </div>
                        </div>
                        <h4>Top executed functions</h4>
                        <div class="plugency-list" data-role="coverage-top">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Awaiting coverage data...</span>
                            </div>
                        </div>
                        <h4>Unused functions (observed)</h4>
                        <div class="plugency-list" data-role="coverage-unused">
                            <div class="plugency-list-item">
                                <span class="plugency-source">Not computed yet.</span>
                            </div>
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
            <button class="plugency-button ghost" data-action="start-inspect"><svg height="16" width="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0.48 0.48" xml:space="preserve" fill="#fff">
                    <path d="M.296.48.23.394.166.478l-.05-.34.32.144L.328.32l.064.086zM.232.328l.072.096.032-.026L.262.3.328.278.166.206.192.38zM.08.36H0V.28h.04v.04h.04zM.04.24H0V.12h.04zM.36.2H.32V.12h.04zm0-.12H.32V.04H.28V0h.08zm-.32 0H0V0h.08v.04H.04zm.2-.04H.12V0h.12z" />
                </svg></button>
            <button class="plugency-button ghost" data-action="show-popups">Show</button>
            <button class="plugency-button ghost" data-action="hide-popups">Hide</button>
            <button class="plugency-button ghost" data-action="clear-popups">Clear</button>
        </div>
        <div class="plugency-inline-actions">
            <span class="plugency-small" data-role="popup-count">0 captured</span>
        </div>
    </div>

    <script id="plugencyDebugSnapshot" type="application/json">
        <?php echo wp_json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES); ?>
    </script>
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

function plugency_dev_help_delete_expired_transients(): array
{
    global $wpdb;
    $now = time();
    $tables = array($wpdb->options);
    if (is_multisite()) {
        $tables[] = $wpdb->sitemeta;
    }
    $deleted = 0;
    foreach ($tables as $table) {
        $col_name = $table === $wpdb->sitemeta ? 'meta_key' : 'option_name';
        $col_value = $table === $wpdb->sitemeta ? 'meta_value' : 'option_value';
        $deleted += (int) $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE ({$col_name} LIKE %s OR {$col_name} LIKE %s) AND {$col_value} < %d",
                $wpdb->esc_like('_transient_timeout_') . '%',
                $wpdb->esc_like('_site_transient_timeout_') . '%',
                $now
            )
        );
    }
    return array('deleted' => $deleted);
}

function plugency_dev_help_delete_expired_transients_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $result = plugency_dev_help_delete_expired_transients();
    wp_send_json_success($result);
}

add_action('wp_ajax_plugency_delete_expired_transients', 'plugency_dev_help_delete_expired_transients_ajax');

function plugency_dev_help_get_budgets_ajax(): void
{
    plugency_dev_help_verify_ajax();
    wp_send_json_success(plugency_dev_help_get_budgets());
}

add_action('wp_ajax_plugency_get_budgets', 'plugency_dev_help_get_budgets_ajax');

function plugency_dev_help_save_budgets_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $raw = isset($_POST['budgets']) ? wp_unslash((string) $_POST['budgets']) : '';
    $decoded = json_decode($raw, true);
    $budgets = is_array($decoded) ? $decoded : array();
    $saved = plugency_dev_help_save_budgets($budgets);
    wp_send_json_success($saved);
}

add_action('wp_ajax_plugency_save_budgets', 'plugency_dev_help_save_budgets_ajax');

function plugency_dev_help_log_budget_violation_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $metric = isset($_POST['metric']) ? sanitize_text_field(wp_unslash((string) $_POST['metric'])) : '';
    $actual = isset($_POST['actual']) ? wp_unslash((string) $_POST['actual']) : '';
    $budget = isset($_POST['budget']) ? wp_unslash((string) $_POST['budget']) : '';
    if ($metric !== '') {
        plugency_dev_help_log_budget_violation($metric, $actual, $budget);
    }
    wp_send_json_success(array('logged' => $metric !== ''));
}

add_action('wp_ajax_plugency_log_budget_violation', 'plugency_dev_help_log_budget_violation_ajax');

function plugency_dev_help_get_perf_tests_ajax(): void
{
    plugency_dev_help_verify_ajax();
    wp_send_json_success(plugency_dev_help_get_perf_tests());
}

add_action('wp_ajax_plugency_get_perf_tests', 'plugency_dev_help_get_perf_tests_ajax');

function plugency_dev_help_save_perf_tests_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $raw = isset($_POST['data']) ? wp_unslash((string) $_POST['data']) : '';
    $decoded = json_decode($raw, true);
    $saved = plugency_dev_help_save_perf_tests(is_array($decoded) ? $decoded : array());
    wp_send_json_success($saved);
}

add_action('wp_ajax_plugency_save_perf_tests', 'plugency_dev_help_save_perf_tests_ajax');

function plugency_dev_help_record_perf_result_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $raw = isset($_POST['result']) ? wp_unslash((string) $_POST['result']) : '';
    $decoded = json_decode($raw, true);
    $saved = plugency_dev_help_record_perf_result(is_array($decoded) ? $decoded : array());
    wp_send_json_success($saved);
}

add_action('wp_ajax_plugency_record_perf_result', 'plugency_dev_help_record_perf_result_ajax');

function plugency_dev_help_apply_security_headers_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $policy = plugency_dev_help_save_security_headers(plugency_dev_help_default_security_headers(), true, 'recommended');
    wp_send_json_success(array('policy' => $policy));
}

add_action('wp_ajax_plugency_apply_security_headers', 'plugency_dev_help_apply_security_headers_ajax');

function plugency_dev_help_save_security_headers_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $raw = isset($_POST['headers']) ? wp_unslash((string) $_POST['headers']) : '';
    $decoded = json_decode($raw, true);
    $headers = is_array($decoded) ? $decoded : array();
    $enable_raw = isset($_POST['enable']) ? wp_unslash((string) $_POST['enable']) : '1';
    $enabled = !in_array(strtolower($enable_raw), array('0', 'false', 'off'), true);
    $policy = plugency_dev_help_save_security_headers($headers, $enabled, 'manual');
    wp_send_json_success(array('policy' => $policy));
}

add_action('wp_ajax_plugency_save_security_headers', 'plugency_dev_help_save_security_headers_ajax');

function plugency_dev_help_clear_opcache_ajax(): void
{
    plugency_dev_help_verify_ajax();
    if (!function_exists('opcache_reset')) {
        wp_send_json_error('OPcache not available', 400);
    }
    $result = @opcache_reset();
    wp_send_json_success(array('cleared' => (bool) $result));
}

add_action('wp_ajax_plugency_clear_opcache', 'plugency_dev_help_clear_opcache_ajax');

function plugency_dev_help_cleanup_unused_cpts_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $names = isset($_POST['names']) ? wp_unslash((string) $_POST['names']) : '';
    $list = array_filter(array_map('sanitize_key', explode(',', $names)));
    $deleted = array();
    foreach ($list as $name) {
        // Cleanup posts and rewrite rules; leave actual registration to code owner.
        $posts = get_posts(array('post_type' => $name, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids'));
        foreach ($posts as $post_id) {
            wp_delete_post($post_id, true);
        }
        $deleted[] = array('post_type' => $name, 'deleted_posts' => count($posts));
    }
    flush_rewrite_rules(false);
    wp_send_json_success(array('cleanup' => $deleted));
}

add_action('wp_ajax_plugency_cleanup_unused_cpts', 'plugency_dev_help_cleanup_unused_cpts_ajax');

function plugency_dev_help_save_heartbeat_settings_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $raw = isset($_POST['settings']) ? wp_unslash((string) $_POST['settings']) : '';
    $decoded = json_decode($raw, true);
    $settings = is_array($decoded) ? $decoded : array();
    $saved = plugency_dev_help_save_heartbeat_settings($settings);
    wp_send_json_success(array('settings' => $saved));
}

add_action('wp_ajax_plugency_save_heartbeat_settings', 'plugency_dev_help_save_heartbeat_settings_ajax');

function plugency_dev_help_apply_heartbeat_recommendations_ajax(): void
{
    plugency_dev_help_verify_ajax();
    $settings = plugency_dev_help_recommended_heartbeat_settings();
    $saved = plugency_dev_help_save_heartbeat_settings($settings);
    wp_send_json_success(array('settings' => $saved));
}

add_action('wp_ajax_plugency_apply_heartbeat_recommendations', 'plugency_dev_help_apply_heartbeat_recommendations_ajax');

/**
 * Recursively replace URLs in meta values while preserving types/serialization.
 */
function plugency_dev_help_replace_value($value, string $old, string $new)
{
    if (is_string($value)) {
        return str_replace($old, $new, $value);
    }
    if (is_array($value)) {
        foreach ($value as $k => $v) {
            $value[$k] = plugency_dev_help_replace_value($v, $old, $new);
        }
        return $value;
    }
    return $value;
}

/**
 * Replace old image URL with new URL in a given post's content and meta.
 */
function plugency_dev_help_update_page_references(int $post_id, string $old_url, string $new_url): array
{
    $result = array(
        'post_id' => $post_id,
        'content_updated' => false,
        'meta_updated' => 0,
        'errors' => array(),
    );

    $post = get_post($post_id);
    if (!$post) {
        $result['errors'][] = 'Post not found.';
        return $result;
    }

    // Update content if needed.
    if (is_string($post->post_content) && strpos($post->post_content, $old_url) !== false) {
        $updated = str_replace($old_url, $new_url, $post->post_content);
        $update = wp_update_post(
            array(
                'ID' => $post_id,
                'post_content' => $updated,
            ),
            true
        );
        if (!is_wp_error($update)) {
            $result['content_updated'] = true;
        } else {
            $result['errors'][] = 'Content update failed: ' . $update->get_error_message();
        }
    }

    // Update meta values for this post only.
    $all_meta = get_post_meta($post_id);
    foreach ($all_meta as $meta_key => $values) {
        if (!is_array($values)) {
            continue;
        }
        foreach ($values as $original_value) {
            $new_value = plugency_dev_help_replace_value($original_value, $old_url, $new_url);
            if ($new_value === $original_value) {
                continue;
            }
            $updated = update_post_meta($post_id, $meta_key, $new_value, $original_value);
            if ($updated) {
                $result['meta_updated']++;
            } else {
                $result['errors'][] = sprintf('Meta update failed for %s.', $meta_key);
            }
        }
    }

    return $result;
}

/**
 * Optimize a single image and persist results.
 */
function plugency_dev_help_optimize_single_image(array $image, array $options, array $upload_dir, int $page_id = 0): array
{
    $src = isset($image['src']) ? esc_url_raw((string) $image['src']) : '';
    $rendered_w = isset($image['rendered_width']) ? (int) $image['rendered_width'] : 0;
    $rendered_h = isset($image['rendered_height']) ? (int) $image['rendered_height'] : 0;

    $resolved = plugency_dev_help_resolve_local_path($src);
    if ($resolved['error'] !== '') {
        return array(
            'src' => $src,
            'status' => 'error',
            'message' => $resolved['error'],
        );
    }

    $original_path = $resolved['path'];
    $original_size = @filesize($original_path);
    $attachment_id = function_exists('attachment_url_to_postid') ? attachment_url_to_postid($src) : 0;

    $editor = wp_get_image_editor($original_path);
    if (is_wp_error($editor)) {
        return array(
            'src' => $src,
            'status' => 'error',
            'message' => $editor->get_error_message(),
        );
    }

    $size = $editor->get_size();
    $target_w = isset($size['width']) ? (int) $size['width'] : 0;
    $target_h = isset($size['height']) ? (int) $size['height'] : 0;
    $resize = !empty($options['resize_to_rendered']) && $rendered_w > 0 && $rendered_h > 0;
    if ($resize && $rendered_w < $target_w && $rendered_h < $target_h) {
        $target_w = $rendered_w;
        $target_h = $rendered_h;
        $editor->resize($target_w, $target_h, false);
    }

    $convert_webp = !empty($options['convert_webp']);
    $lossless = !empty($options['lossless']);
    $quality = $lossless ? 100 : 82;
    $notes = array();
    $pathinfo = pathinfo($original_path);
    $original_ext = isset($pathinfo['extension']) ? strtolower((string) $pathinfo['extension']) : 'jpg';
    if ($convert_webp && function_exists('wp_image_editor_supports') && !wp_image_editor_supports(array('mime_type' => 'image/webp'))) {
        $convert_webp = false;
    }
    $target_ext = $convert_webp ? 'webp' : $original_ext;
    $target_mime = $convert_webp ? 'image/webp' : null;
    if (!$convert_webp && !empty($options['convert_webp'])) {
        $notes[] = 'WEBP not supported on this server; using original format.';
    }
    $optimized_dir = trailingslashit($upload_dir['basedir']) . 'plugency-dev-help/optimized';
    wp_mkdir_p($optimized_dir);
    $base_name = isset($pathinfo['filename']) ? $pathinfo['filename'] : 'image';
    $target_filename = wp_unique_filename($optimized_dir, $base_name . '-plugency-opt.' . $target_ext);
    $target_path = trailingslashit($optimized_dir) . $target_filename;

    if (method_exists($editor, 'set_quality')) {
        $editor->set_quality($quality);
    }

    $saved = $editor->save($target_path, $target_mime);
    if (is_wp_error($saved)) {
        return array(
            'src' => $src,
            'status' => 'error',
            'message' => $saved->get_error_message(),
        );
    }

    if (isset($saved['path']) && $saved['path'] !== $target_path) {
        $target_path = $saved['path'];
    }

    if (file_exists($target_path) && function_exists('wp_update_image_subsizes')) {
        $editor->set_quality($quality);
    }

    $optimized_size = @filesize($target_path);
    $savings = ($original_size && $optimized_size) ? max(0, $original_size - $optimized_size) : null;
    $updated_db = false;
    $removed_original = false;

    if (!empty($options['update_db']) && $attachment_id) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $relative = ltrim(str_replace(trailingslashit($upload_dir['basedir']), '', $target_path), '/');
        update_post_meta($attachment_id, '_wp_attached_file', $relative);
        $meta = wp_generate_attachment_metadata($attachment_id, $target_path);
        if (!is_wp_error($meta)) {
            wp_update_attachment_metadata($attachment_id, $meta);
            $updated_db = true;
        } else {
            $notes[] = 'Metadata update failed: ' . $meta->get_error_message();
        }
    }

    if (!empty($options['remove_original']) && $updated_db) {
        $uploads_path = wp_normalize_path(trailingslashit($upload_dir['basedir']));
        $normalized_original = wp_normalize_path($original_path);
        if (strpos($normalized_original, $uploads_path) === 0 && $normalized_original !== wp_normalize_path($target_path)) {
            @unlink($original_path);
            $removed_original = true;
        } else {
            $notes[] = 'Original not removed (outside uploads or same as optimized).';
        }
    }

    $optimized_url = trailingslashit($upload_dir['baseurl']) . 'plugency-dev-help/optimized/' . $target_filename;
    $page_updates = array();
    if (!empty($options['update_db']) && $page_id > 0) {
        $page_updates = plugency_dev_help_update_page_references($page_id, $src, $optimized_url);
    } elseif (!empty($options['update_db'])) {
        $notes[] = 'Page ID missing; database references not updated.';
    }

    return array(
        'src' => $src,
        'status' => 'ok',
        'message' => 'Optimized',
        'path' => $target_path,
        'url' => esc_url_raw($optimized_url),
        'original_size' => $original_size,
        'optimized_size' => $optimized_size,
        'savings' => $savings,
        'updated_db' => $updated_db,
        'removed_original' => $removed_original,
        'notes' => $notes,
        'page_updates' => $page_updates,
    );
}

function plugency_dev_help_optimize_images_ajax(): void
{
    plugency_dev_help_verify_ajax();

    if (!class_exists('ZipArchive')) {
        wp_send_json_error('ZipArchive extension is required for downloads.', 500);
    }

    $images_raw = isset($_POST['images']) ? wp_unslash((string) $_POST['images']) : '[]';
    $options_raw = isset($_POST['options']) ? wp_unslash((string) $_POST['options']) : '{}';
    $images = json_decode($images_raw, true);
    $options = json_decode($options_raw, true);
    $page_id = isset($_POST['page_id']) ? absint($_POST['page_id']) : 0;

    if (!is_array($images) || empty($images)) {
        wp_send_json_error('No images provided for optimization.', 400);
    }

    $upload_dir = wp_get_upload_dir();
    $results = array();
    $optimized_paths = array();

    foreach ($images as $image) {
        $result = plugency_dev_help_optimize_single_image(is_array($image) ? $image : array(), is_array($options) ? $options : array(), $upload_dir, $page_id);
        $results[] = $result;
        if (isset($result['status']) && $result['status'] === 'ok' && !empty($result['path']) && file_exists($result['path'])) {
            $optimized_paths[] = $result['path'];
        }
    }

    $zip_url = '';
    $zip_size = 0;
    if (!empty($optimized_paths)) {
        $zip_dir = trailingslashit($upload_dir['basedir']) . 'plugency-dev-help/optimized';
        wp_mkdir_p($zip_dir);
        $zip_name = 'plugency-optimized-' . gmdate('Ymd-His') . '.zip';
        $zip_path = trailingslashit($zip_dir) . $zip_name;
        $zip = new ZipArchive();
        if ($zip->open($zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE)) {
            foreach ($optimized_paths as $path) {
                $zip->addFile($path, basename($path));
            }
            $zip->close();
            $zip_size = @filesize($zip_path);
            $zip_url = trailingslashit($upload_dir['baseurl']) . 'plugency-dev-help/optimized/' . $zip_name;
        }
    }

    wp_send_json_success(
        array(
            'results' => $results,
            'download_url' => $zip_url,
            'download_size' => $zip_size,
        )
    );
}

add_action('wp_ajax_plugency_optimize_images', 'plugency_dev_help_optimize_images_ajax');

function plugency_dev_help_purge_cache_ajax(): void
{
    plugency_dev_help_verify_ajax();
    /**
     * Allow integration with cache plugins via custom hooks.
     * Developers can hook this action to clear their cache.
     */
    do_action('plugency_dev_help_purge_cache');
    wp_send_json_success(array('message' => 'Cache purge signal sent. Integrate via plugency_dev_help_purge_cache.'));
}

add_action('wp_ajax_plugency_purge_cache', 'plugency_dev_help_purge_cache_ajax');

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
