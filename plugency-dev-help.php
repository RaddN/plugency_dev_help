<?php
/**
 * Plugin Name: Plugency Dev Help
 * Description: Displays included PHP files and enqueued CSS/JS files for developers (Admin access only).
 * Version: 1.1
 * Author: Raihan Hossain
 */

// Prevent direct access to the file
if (!defined('ABSPATH')) {
    exit;
}

function list_included_files_and_assets() {
    // Check if the user is logged in and is an admin
    if (!is_user_logged_in() || !current_user_can('administrator')) {
        return;
    }

    // Get included PHP files
    $included_files = get_included_files();
    
    // Get enqueued styles and scripts
    global $wp_styles, $wp_scripts;

    $enqueued_styles = [];
    $enqueued_scripts = [];

    foreach ($wp_styles->queue as $handle) {
        $enqueued_styles[] = $wp_styles->registered[$handle]->src;
    }

    foreach ($wp_scripts->queue as $handle) {
        $enqueued_scripts[] = $wp_scripts->registered[$handle]->src;
    }

    // Get debug file contents
    $debug_file_path = ABSPATH . 'wp-content/debug.log';
    $debug_content = 'Debug file not found or not readable.';
    if (file_exists($debug_file_path) && is_readable($debug_file_path)) {
        $debug_content = file_get_contents($debug_file_path);
    }
    ?>
    <style>
        pre#debug-content {
            padding-right: 50px !important;
            padding-bottom: 20px !important ;
            overflow: auto;
        }
        .dev-help-icon {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 50px;
            height: 50px;
            background: #0073aa;
            color: #fff;
            border-radius: 50%;
            text-align: center;
            line-height: 50px;
            cursor: pointer;
            font-size: 20px;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .dev-help-icon img{filter: brightness(0) saturate(100%) invert(100%) sepia(0%) saturate(7463%) hue-rotate(174deg) brightness(110%) contrast(99%);}
        .dev-help-tabs {
            position: fixed;
            bottom: 0px;
            left: 20px;
            width: 98%;
            height: 80%;
            background: #fff;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
            display: none;
            z-index: 9999;
        }
        .dev-help-tabs h2 {
            background: #0073aa;
            color: #fff;
            margin: 0;
            padding: 10px;
        }
        .dev-help-content {
            max-height: 88%;
            overflow-y: auto;
            padding: 30px;
            padding-bottom:50px;
        }
        .dev-help-nav {
            display: flex;
            background: #005177;
        }
        .dev-help-nav button {
            flex: 1;
            background: #0073aa;
            color: white;
            border: none;
            padding: 10px;
            cursor: pointer;
        }
        .dev-help-nav button.active {
            background: #004466;
        }
        .dev-help-section {
            display: none;
        }
        .dev-help-section.active {
            display: block;
        }
        .trash-icon {
            float: right;
            cursor: pointer;
            color: red;
            font-size: 20px;
        }
    </style>
    <div class="dev-help-icon" onclick="toggleDevHelp()">⚙</div>
    <div class="dev-help-tabs" id="devHelpTabs">
        <h2>Developer Debug Panel</h2>
        <div class="dev-help-nav">
            <button onclick="showTab('php')" class="active">PHP Files</button>
            <button onclick="showTab('css')">CSS Files</button>
            <button onclick="showTab('js')">JS Files</button>
            <button onclick="showTab('debug')">Debug File</button>
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
                <pre id="debug-content"><?php echo htmlspecialchars($debug_content); ?></pre>
            </div>
        </div>
    </div>
    <script>
        function toggleDevHelp() {
            let panel = document.getElementById("devHelpTabs");
            panel.style.display = panel.style.display === "block" ? "none" : "block";
        }
        function showTab(tab) {
            document.querySelectorAll('.dev-help-section').forEach(section => {
                section.classList.remove('active');
            });
            document.querySelectorAll('.dev-help-nav button').forEach(button => {
                button.classList.remove('active');
            });
            document.getElementById(tab).classList.add('active');
            event.target.classList.add('active');
        }
        function deleteDebugFile() {
            if (confirm("Are you sure you want to delete the debug file?")) {
                fetch("<?php echo admin_url('admin-ajax.php'); ?>?action=delete_debug_file", {
                    method: "POST"
                }).then(response => response.text()).then(data => {
                    alert(data);
                    document.getElementById("debug-content").innerText = "Debug file not found or not readable.";
                });
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

