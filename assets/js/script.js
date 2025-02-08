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
            .then(data => {
                alert(data);
                document.getElementById("debug-content").innerText = "Debug file not found or unreadable.";
            });
    }
}

// Additional event listeners for the toggle buttons
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

// Click event to hide on outside click
document.addEventListener('click', function(event) {
    const devHelpTabs = document.getElementById('devHelpTabs');
    const helpIcon = document.querySelector('.dev-help-icon');
    if (!devHelpTabs.contains(event.target) && !helpIcon.contains(event.target)) {
        devHelpTabs.style.display = 'none';
    }
});

// Keydown event to hide on Escape key press
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        document.getElementById('devHelpTabs').style.display = 'none';
    }
});