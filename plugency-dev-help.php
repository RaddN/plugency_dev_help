<?php
/**
 * Plugin Name: Plugency Dev Help
 * Description: Displays included PHP files, enqueued CSS/JS files, and request data for developers (Admin access only).
 * Version: 1.0.0
 * Author: Raihan Hossain
 */

// Prevent direct access to the file
if (!defined('ABSPATH')) {
    exit;
}


function plugency_enqueue_styles() {
    wp_enqueue_style('plugency-style', plugin_dir_url(__FILE__) . 'style.css');
}
add_action('wp_enqueue_scripts', 'plugency_enqueue_styles');
add_action('admin_enqueue_scripts', 'plugency_enqueue_styles');

function list_included_files_and_assets() {
    // Check if the user is logged in and is an admin
    if (!is_user_logged_in() || !current_user_can('administrator')) {
        return;
    }

    // Get included PHP files
    $included_files = get_included_files();
    
    // Get enqueued styles and scripts
    global $wp_styles, $wp_scripts, $wpdb;

    $enqueued_styles = [];
    $enqueued_scripts = [];

    $enqueued_styles = array_map(fn($handle) => $wp_styles->registered[$handle]->src, $wp_styles->queue);

    $enqueued_scripts = array_map(fn($handle) => $wp_scripts->registered[$handle]->src, $wp_scripts->queue);

    // Get debug file contents
    $debug_file_path = ABSPATH . 'wp-content/debug.log';
    $debug_content = file_exists($debug_file_path) && is_readable($debug_file_path) ? file_get_contents($debug_file_path) : 'Debug file not found or unreadable.';
    $debug_logging_enabled = defined('WP_DEBUG') && WP_DEBUG;

    // Get request data
    $request_data = [
        'GET' => $_GET,
        'POST' => $_POST,
        'COOKIE' => $_COOKIE,
        'SERVER' => $_SERVER,
        'FILES' => $_FILES,
        'REQUEST' => $_REQUEST,
        'SESSION' => isset($_SESSION) ? $_SESSION : [],
        'ENV' => $_ENV
    ];
    

    // Get database queries if SAVEQUERIES is enabled
    $db_queries = [];
    if (defined('SAVEQUERIES') && SAVEQUERIES) {
        $db_queries = $wpdb->queries;
    }
    // Count total number of requests
    $total_requests = array_sum(array_map('count', $request_data)) + count($db_queries);
    $total_get = count($_GET);
    $total_post = count($_POST);
    $total_cookie = count($_COOKIE);
    $total_server = count($_SERVER);
    $total_files = count($_FILES);
    $total_session = isset($_SESSION) ? count($_SESSION) : 0;
    $total_db = count($db_queries);
    $total_env = count($_ENV);

    $request_counts = [
        'GET' => $total_get,
        'POST' => $total_post,
        'COOKIE' => $total_cookie,
        'SERVER' => $total_server,
        'FILES' => $total_files,
        'SESSION' => $total_session,
        'ENV' => $total_env
    ];
    ?>
    <div class="dev-help-icon" onclick="toggleDevHelp()">⚙</div>
    <div class="dev-help-tabs" id="devHelpTabs">
        <h2>Developer Debug Panel</h2>
        <div class="dev-help-nav">
            <button onclick="showTab('php')" class="active">PHP Files</button>
            <button onclick="showTab('css')">CSS Files</button>
            <button onclick="showTab('js')">JS Files</button>
            <button onclick="showTab('debug')">Debug File</button>
            <button onclick="showTab('requests')">Requests</button>
        </div>
        <div class="dev-help-content">
            <div id="php" class="dev-help-section active">
                <pre><?php print_r($included_files); ?></pre>
            </div>
            <div id="css" class="dev-help-section">
                <pre><?php print_r($enqueued_styles); ?></pre>
            </div>
            <div id="js" class="dev-help-section">
                <pre><?php print_r($enqueued_scripts); ?></pre>
            </div>
            <div id="debug" class="dev-help-section">
                <h3>Debug File <span class="trash-icon" onclick="deleteDebugFile()">🗑</span></h3>
                <button id="toggleDebugLog"> <?php echo $debug_logging_enabled ? 'Disable' : 'Enable'; ?> Debug Log</button>
                <script>
                    document.getElementById('toggleDebugLog').addEventListener('click', function() {
                        const status = this.innerText.includes('Enable') ? 'on' : 'off';
                        fetch("<?php echo admin_url('admin-ajax.php'); ?>", {
                            method: "POST",
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: "action=toggle_debug_log&status=" + status
                        }).then(response => response.text()).then(data => {
                            document.getElementById('debugLogStatus').innerText = data;
                            location.reload(); // Reload to reflect changes
                        });
                    });
                </script>
        <p id="debugLogStatus"></p>
                <pre id="debug-content"><?php echo htmlspecialchars($debug_content); ?></pre>
            </div>
            <div id="requests" class="dev-help-section">
            <h3>Total Requests: <?php echo $total_requests; ?></h3>
            <div class="request-tabs">
                    <?php foreach ($request_counts as $key => $count) : ?>
                        <button onclick="showRequestTab('<?php echo strtolower($key); ?>')"> 
                            <?php echo $key . ' (' . $count . ')'; ?> 
                        </button>
                    <?php endforeach; ?>
                    <button onclick="showRequestTab('database')"> Database(<?php echo $total_db; ?>) </button>
                </div>
                <?php foreach ($request_data as $key => $data) : ?>
                    <div id="<?php echo strtolower($key); ?>" class="request-section">
                        <h4><?php echo $key; ?> Data</h4>
                        <pre><?php print_r($data); ?></pre>
                    </div>
                <?php endforeach; ?>
                <div id="database" class="request-section">
                        <h4>Database Queries</h4>
                        <?php 
                        plugency_admin_settings(); 
                        plugency_display_query_insights(); ?>
                        <h4>All Queries:</h4>
                        <code><pre><?php print_r($db_queries); ?></pre></code>
                    </div>  
            </div>
        </div>
    </div>
    <script>
        function toggleDevHelp() {
            let panel = document.getElementById("devHelpTabs");
            panel.style.display = panel.style.display === "block" ? "none" : "block";
        }
        function showTab(tab) {
            document.querySelectorAll('.dev-help-section').forEach(section => section.classList.remove('active'));
            document.querySelectorAll('.dev-help-nav button').forEach(button => button.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            event.target.classList.add('active');
        }
        function showRequestTab(tab) {
            document.querySelectorAll('.request-section').forEach(section => section.style.display = 'none');
            document.getElementById(tab).style.display = 'block';
        }
        function deleteDebugFile() {
            if (confirm("Delete the debug file?")) {
                fetch("<?php echo admin_url('admin-ajax.php'); ?>?action=delete_debug_file", { method: "POST" })
                .then(response => response.text())
                .then(data => { alert(data); document.getElementById("debug-content").innerText = "Debug file not found or unreadable."; });
            }
        }
    </script>
    <?php
}
function delete_debug_file() {
    $debug_file_path = ABSPATH . 'wp-content/debug.log';
    if (file_exists($debug_file_path)) {
        unlink($debug_file_path);
        echo "Debug file deleted successfully.";
    } else {
        echo "Debug file not found.";
    }
    wp_die();
}
add_action('wp_ajax_delete_debug_file', 'delete_debug_file');
add_action('wp_footer', 'list_included_files_and_assets');
add_action('admin_footer', 'list_included_files_and_assets');



function plugency_toggle_query_logging($enable) {
    $wp_config_path = ABSPATH . 'wp-config.php';

    // Check if wp-config.php is writable
    if (!is_writable($wp_config_path)) {
        return "Error: wp-config.php is not writable.";
    }

    error_log("hello");

    // Get the current contents of wp-config.php
    $config_content = file_get_contents($wp_config_path);
    
    if ($enable) {
        // Enable query logging
        if (strpos($config_content, "define('SAVEQUERIES'") === false) {
            $config_content = str_replace("<?php", "<?php\ndefine('SAVEQUERIES', true);", $config_content);
        }

        file_put_contents($wp_config_path, $config_content);
        return "Query logging enabled.";
    } else {
        // Disable query logging
        $config_content = preg_replace("/define\\('SAVEQUERIES',\\s*true\\);\\s*/", "", $config_content);
        file_put_contents($wp_config_path, $config_content);
        return "Query logging disabled.";
    }

    return "Query logging state unchanged.";
}

// AJAX to toggle query logging
function plugency_toggle_query_logging_ajax() {
    $status = isset($_POST['status']) ? $_POST['status'] : 'off';
    $message = plugency_toggle_query_logging($status === 'on');
    echo $message;
    wp_die();
}
add_action('wp_ajax_toggle_query_logging', 'plugency_toggle_query_logging_ajax');


function plugency_display_query_insights() {
    global $wpdb;
    if (!defined('SAVEQUERIES') || !SAVEQUERIES) {
        echo "<p>Query logging is disabled. Enable it</p>";
        return;
    }

    if (!isset($wpdb->queries)) {
        echo "<p>No queries logged.</p>";
        return;
    }

    $queries = $wpdb->queries;
    usort($queries, function ($a, $b) {
        return $b[1] <=> $a[1]; // Sort by execution time (descending)
    });

    $total_time = array_sum(array_column($queries, 1));
    $total_queries = count($queries);
    
    echo "<h4>Total Queries: $total_queries</h4>";
    echo "<h4>Total Execution Time: " . round($total_time, 4) . "s</h4>";

    echo "<h4>Slowest Queries:</h4>";
    echo "<pre>";
    foreach (array_slice($queries, 0, 5) as $query) {
        echo "Time: " . round($query[1], 5) . "s | Query: " . esc_html($query[0]) . "\n";
    }
    echo "</pre>";
}


function plugency_admin_settings() {
    ?>
    <div class="wrap">
        <button id="toggleQueryLogging"><?php echo defined('SAVEQUERIES') && SAVEQUERIES ? 'Disable' : 'Enable'; ?> Query Logging</button>
        <p id="queryToggleMsg"></p>
    </div>

    <script>
        document.getElementById('toggleQueryLogging').addEventListener('click', function() {
            let status = this.innerText.includes('Enable') ? 'on' : 'off';
            fetch("<?php echo admin_url('admin-ajax.php'); ?>", {
                method: "POST",
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: "action=toggle_query_logging&status=" + status
            }).then(response => response.text()).then(data => {
                document.getElementById('queryToggleMsg').innerText = data;
                location.reload();
            });
        });
    </script>
    <?php
}
function toggle_debug_log() {
    $wp_config_path = ABSPATH . 'wp-config.php';

    if (!is_writable($wp_config_path)) {
        echo "Error: wp-config.php is not writable.";
        wp_die();
    }

    $config_content = file_get_contents($wp_config_path);

    if ($_POST['status'] === 'on') {
        // Enable debugging
        if (!preg_match("/define\('WP_DEBUG',\s*true\);/", $config_content)) {
            $config_content = preg_replace("/(<\?php)/", "<?php\n\n// Debug Mode\ndefine('WP_DEBUG', true);\ndefine('WP_DEBUG_LOG', true);\ndefine('WP_DEBUG_DISPLAY', false);\n@ini_set('display_errors', 0);\n", $config_content, 1);
            file_put_contents($wp_config_path, $config_content);
            echo "Debug logging enabled.";
        } else {
            echo "Debug logging is already enabled.";
        }
    } else {
        // Disable debugging
        $config_content = preg_replace("/define\('WP_DEBUG',\s*true\);\s*/", "define('WP_DEBUG', false);\n", $config_content);
        $config_content = preg_replace("/define\('WP_DEBUG_LOG',\s*true\);\s*/", "", $config_content);
        $config_content = preg_replace("/define\('WP_DEBUG_DISPLAY',\s*false\);\s*/", "", $config_content);
        file_put_contents($wp_config_path, $config_content);
        echo "Debug logging disabled.";
    }

    wp_die();
}

add_action('wp_ajax_toggle_debug_log', 'toggle_debug_log');

