const state = {
    currentTab: 'image',
    currentFile: null,
    isProcessing: false,
    audioContext: null,
    analyser: null,
    dataArray: null,
    animationFrame: null,
    supportedTypes: {
        image: {
            formats: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
            hint: 'Supports JPG, PNG, WebP',
            accept: '.jpg,.jpeg,.png,.webp'
        },
        video: {
            formats: ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska'],
            hint: 'Supports MP4, AVI, MOV, MKV',
            accept: '.mp4,.avi,.mov,.mkv'
        }
    },
    // Voice Assistant State
    voiceAssistant: {
        isRecording: false,
        audioRecorder: null,
        audioStream: null,
        audioBlob: null,
        visualizerAnimation: null,
        lastQuery: '',
        lastResponse: ''
    }
};

// Elements
const elements = {
    uploadArea: document.getElementById('uploadArea'),
    previewContainer: document.getElementById('previewContainer'),
    preview: document.getElementById('preview'),
    processBtn: document.getElementById('processBtn'),
    clearBtn: document.getElementById('clearBtn'),
    formatHint: document.getElementById('formatHint'),
    scenarioContent: document.getElementById('scenarioContent'),
    detectionsContainer: document.getElementById('detectionsContainer'),
    resultsSection: document.getElementById('resultsSection'),
    loader: document.getElementById('loader'),
    toast: document.getElementById('toast'),
    audioPlayer: document.getElementById('audioPlayer'),
    playBtn: document.getElementById('playBtn'),
    audioVisualizer: document.getElementById('audioVisualizer'),
    copyResultsBtn: document.getElementById('copyResultsBtn'),
    tabs: document.querySelectorAll('.tab'),
    sideMenu: document.getElementById('sideMenu'),
    sideMenuTrigger: document.getElementById('sideMenuTrigger'),
    closeSideMenu: document.getElementById('closeSideMenu'),
    sideMenuContent: document.getElementById('sideMenuContent')
};

// Initialize Audio Visualizer
function initAudioVisualizer() {
    const NUM_BARS = 32;
    elements.audioVisualizer.innerHTML = '';
    for (let i = 0; i < NUM_BARS; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        elements.audioVisualizer.appendChild(bar);
    }
}

// Initialize Audio Context
async function initAudioContext() {
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.dataArray = new Uint8Array(state.analyser.frequencyBinCount);

        const source = state.audioContext.createMediaElementSource(elements.audioPlayer);
        source.connect(state.analyser);
        state.analyser.connect(state.audioContext.destination);
    }

    // Always attempt to resume the audio context
    if (state.audioContext.state === 'suspended') {
        try {
            await state.audioContext.resume();
            console.log('AudioContext resumed successfully');
        } catch (resumeError) {
            console.error('Failed to resume AudioContext:', resumeError);
        }
    }
}

// Update Visualizer
function updateVisualizer() {
    if (!state.analyser) return;

    state.analyser.getByteFrequencyData(state.dataArray);
    const bars = elements.audioVisualizer.children;

    for (let i = 0; i < bars.length; i++) {
        const value = state.dataArray[i];
        const percent = value / 255;
        bars[i].style.transform = `scaleY(${Math.max(0.1, percent)})`;
        bars[i].style.opacity = Math.max(0.3, percent);
    }

    state.animationFrame = requestAnimationFrame(updateVisualizer);
}

// File Handling
function handleFile(file) {
    if (!validateFile(file)) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const element = state.currentTab === 'image'
            ? createImagePreview(e.target.result)
            : createVideoPreview(e.target.result);

        elements.preview.innerHTML = '';
        elements.preview.appendChild(element);
        elements.uploadArea.style.display = 'none';
        elements.previewContainer.style.display = 'block';

        state.currentFile = file;
        updateControls();
        showToast('File uploaded successfully');
    };

    reader.onerror = () => showToast('Error reading file', 'error');
    reader.readAsDataURL(file);
}

function createImagePreview(src) {
    const img = document.createElement('img');
    img.src = src;
    return img;
}

function createVideoPreview(src) {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    return video;
}

function validateFile(file) {
    const validTypes = state.supportedTypes[state.currentTab].formats;
    if (!validTypes.includes(file.type)) {
        showToast(`Invalid file type. ${state.supportedTypes[state.currentTab].hint}`);
        return false;
    }
    return true;
}

// UI Updates
function updateControls() {
    elements.processBtn.disabled = !state.currentFile || state.isProcessing;
    elements.clearBtn.disabled = !state.currentFile || state.isProcessing;
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type || ''}`;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}        // Tab Switching
function switchTab(tab) {
    if (state.currentTab === tab || state.isProcessing) return;

    state.currentTab = tab;
    elements.formatHint.textContent = state.supportedTypes[tab].hint;

    // Update active state of tab buttons
    document.querySelectorAll('.tab').forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-tab') === tab);
    });

    clearUpload();
}        // Process File

// Helper function to attempt audio playback
async function tryPlayAudio() {
    try {
        // Remove event listeners to prevent multiple play attempts
        elements.audioPlayer.onloadedmetadata = null;
        elements.audioPlayer.oncanplay = null;
        elements.audioPlayer.oncanplaythrough = null;

        // Check if already playing to avoid errors
        if (elements.audioPlayer.paused) {
            console.log('Attempting to play audio...');
            // Use user activation API if available (helps with autoplay policies)
            const playPromise = elements.audioPlayer.play();

            if (playPromise !== undefined) {
                await playPromise;
                console.log('Audio playback started successfully');
                elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                updateVisualizer();
            }
        }
    } catch (error) {
        handlePlayError(error);
    }
}

// Helper function to handle play errors
function handlePlayError(error) {
    console.error('Autoplay failed:', error);
    elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';

    // Give more specific feedback based on the error
    if (error.name === 'NotAllowedError') {
        showToast('Browser blocked autoplay. Click play to listen.', 'info');
    } else if (error.name === 'AbortError') {
        showToast('Playback was aborted. Try again.', 'info');
    } else {
        showToast('Click play to listen to audio narration', 'info');
    }
}

// Display Results
function displayScenario(text) {
    elements.scenarioContent.textContent = text;
}

function displayDetections(detections) {
    if (!detections || Object.keys(detections).length === 0) {
        const noObjectsHtml = `
                    <div class="detection-group">
                        <div class="detection-item">
                            <i class="fas fa-info-circle"></i>
                            No objects detected
                        </div>
                    </div>
                `;
        elements.sideMenuContent.innerHTML = noObjectsHtml;
        return;
    }

    const detectionsHtml = Object.entries(detections)
        .map(([type, instances]) => {
            // Format the type by capitalizing first letter of each word
            const formattedType = type.split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            return `
                    <div class="detection-group">
                        <div class="detection-header">
                            <span class="detection-title">
                                <i class="fas fa-tag"></i>
                                ${formattedType}
                            </span>
                            <span class="detection-count">${instances.length}</span>
                        </div>
                        <div class="detection-list">
                            ${instances.map((instance, index) => {
                // Extract position
                const position = instance.position;

                return `
                                <div class="detection-item">
                                    <div class="position">
                                        <i class="fas fa-map-marker-alt"></i>
                                        ${formattedType} ${index + 1} at ${position}
                                    </div>
                                    <span class="confidence">
                                        ${(instance.confidence * 100).toFixed(1)}%
                                    </span>
                                </div>
                                `;
            }).join('')}
                        </div>
                    </div>
                    `;
        }).join('');

    // Update side menu content
    elements.sideMenuContent.innerHTML = detectionsHtml;

    // Show side menu trigger if we have detections
    elements.sideMenuTrigger.style.display = 'flex';

    // Animate the side menu trigger to draw attention
    elements.sideMenuTrigger.classList.add('pulse');
    setTimeout(() => elements.sideMenuTrigger.classList.remove('pulse'), 2000);
}

// Copy Results
elements.copyResultsBtn.addEventListener('click', async () => {
    try {
        const scenarioText = elements.scenarioContent.textContent;

        // Get all detection items text
        const detectionItems = Array.from(elements.detectionsContainer.querySelectorAll('.detection-item'))
            .map(item => {
                const position = item.querySelector('.position').textContent.trim();
                const confidence = item.querySelector('.confidence').textContent.trim();
                return `${position} (${confidence})`;
            })
            .join('\n');

        const textToCopy = `Scene Description:\n${scenarioText}\n\nDetected Objects:\n${detectionItems}`;

        await navigator.clipboard.writeText(textToCopy);
        showToast('Results copied to clipboard');

        const originalHtml = elements.copyResultsBtn.innerHTML;                // Show different confirmation based on screen size
        if (window.innerWidth <= 480) {
            elements.copyResultsBtn.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            elements.copyResultsBtn.innerHTML = '<i class="fas fa-check"></i> <span class="copy-text">Copied!</span>';
        }

        setTimeout(() => {
            elements.copyResultsBtn.innerHTML = originalHtml;
        }, 2000);

    } catch (err) {
        console.error('Failed to copy:', err);
        showToast('Failed to copy to clipboard');
    }
});

// Display a welcoming placeholder message in the results area when page loads
function displayPlaceholderContent() {
    elements.scenarioContent.innerHTML = `
                <div class="placeholder-message">
                    <i class="fas fa-lightbulb" style="font-size: 1.5rem; color: var(--primary-light); margin-bottom: 1rem;"></i>
                    <h3 style="margin-bottom: 0.5rem;">Ready to analyze your image</h3>
                    <p>Upload an image or video from the left panel and click "Process" to see AI analysis results here.</p>
                </div>
            `;
}        // Initialize the page with placeholder content and visible objects button
document.addEventListener('DOMContentLoaded', function () {
    displayPlaceholderContent();

    // Make objects button visible by default
    updateSideMenuTriggers('flex');

    // Initialize side menu content with placeholder
    elements.sideMenuContent.innerHTML = `
                <div class="detection-group">
                    <div class="detection-item" style="text-align: center; padding: 1.5rem;">
                        <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                            <i class="fas fa-camera" style="font-size: 2rem; color: var(--primary); margin-bottom: 1rem;"></i>
                            <p>Upload and process an image to see detected objects here.</p>
                        </div>
                    </div>
                </div>
            `;
});

// Clear Upload (updated to preserve the results section visibility)
function clearUpload() {
    elements.preview.innerHTML = '';
    elements.uploadArea.style.display = 'flex';
    elements.previewContainer.style.display = 'none';

    // Reset but keep visible
    displayPlaceholderContent();
    elements.audioPlayer.src = '';
    elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';

    // Don't hide results section, just show placeholder
    // elements.resultsSection.style.display = 'none';

    // Keep side menu trigger visible, just update content
    // elements.sideMenuTrigger.style.display = 'none';

    // Reset side menu content to placeholder
    elements.sideMenuContent.innerHTML = `
                <div class="detection-group">
                    <div class="detection-item" style="text-align: center; padding: 1.5rem;">
                        <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                            <i class="fas fa-camera" style="font-size: 2rem; color: var(--primary); margin-bottom: 1rem;"></i>
                            <p>Upload and process an image to see detected objects here.</p>
                        </div>
                    </div>
                </div>
            `;

    // Close side menu if open
    if (elements.sideMenu.classList.contains('open')) {
        elements.sideMenu.classList.remove('open');
        elements.sideMenuTrigger.classList.remove('open');
    }

    cancelAnimationFrame(state.animationFrame);
    state.currentFile = null;
    updateControls();
}        // Event Listeners for Tab Buttons
document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => {
        if (state.isProcessing) return;

        const tab = button.getAttribute('data-tab');
        if (tab) switchTab(tab);
    });
});

// Event Listener for File Upload Area
elements.uploadArea.addEventListener('click', () => {
    if (state.isProcessing) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = state.supportedTypes[state.currentTab].accept;
    input.onchange = e => handleFile(e.target.files[0]);
    input.click();
});

elements.uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    elements.uploadArea.style.borderColor = 'var(--primary)';
    elements.uploadArea.style.background = 'rgba(79, 70, 229, 0.05)';
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.style.borderColor = 'var(--border)';
    elements.uploadArea.style.background = '';
});

elements.uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    elements.uploadArea.style.borderColor = 'var(--border)';
    elements.uploadArea.style.background = '';
    handleFile(e.dataTransfer.files[0]);
});

elements.playBtn.addEventListener('click', async () => {
    if (elements.audioPlayer.paused) {
        await elements.audioPlayer.play();
        elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        updateVisualizer();
    } else {
        elements.audioPlayer.pause();
        elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        cancelAnimationFrame(state.animationFrame);
    }
});

elements.audioPlayer.addEventListener('ended', () => {
    elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
    cancelAnimationFrame(state.animationFrame);
});

elements.processBtn.addEventListener('click', processFile);
elements.clearBtn.addEventListener('click', clearUpload);

// Side Menu Toggle
elements.sideMenuTrigger.addEventListener('click', () => {
    elements.sideMenu.classList.toggle('open');
    elements.sideMenuTrigger.classList.toggle('open');
});

elements.closeSideMenu.addEventListener('click', () => {
    elements.sideMenu.classList.remove('open');
    elements.sideMenuTrigger.classList.remove('open');
});

// Close side menu when clicking outside
document.addEventListener('click', (event) => {
    if (!elements.sideMenu.contains(event.target) &&
        !elements.sideMenuTrigger.contains(event.target) &&
        elements.sideMenu.classList.contains('open')) {
        elements.sideMenu.classList.remove('open');
        elements.sideMenuTrigger.classList.remove('open');
    }
});        // Keep side menu trigger visible at all times
elements.sideMenuTrigger.style.display = 'flex';

// Initialize
initAudioVisualizer();

// Create and animate floating glass-like particles
function createParticles() {
    const particlesContainer = document.getElementById('particlesContainer');
    // Reduced particle count for less density
    const particleCount = Math.min(window.innerWidth / 20, 50);

    particlesContainer.innerHTML = '';

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');

        // Randomly determine particle size
        const sizeClass = Math.random() < 0.5 ? 'small' :
            Math.random() < 0.8 ? 'medium' : 'large';

        // Randomly determine particle color/style
        const styleClass = Math.random() < 0.33 ? 'primary' :
            Math.random() < 0.66 ? 'accent' : 'light';

        // Assign a depth layer - foreground, midground, or background
        const depthLayer = Math.random() < 0.33 ? 'foreground' :
            Math.random() < 0.66 ? 'midground' : 'background';

        particle.className = `particle ${sizeClass} ${styleClass} ${depthLayer}`;

        // Position particles ONLY on the edges and corners
        let left, top;

        // Determine which edge to place the particle on
        const edge = Math.floor(Math.random() * 4); // 0: left, 1: right, 2: top, 3: bottom

        // Calculate position based on the selected edge
        switch (edge) {
            case 0: // Left edge
                left = Math.random() * 15; // Only in first 15% from left
                top = Math.random() * 100;
                break;
            case 1: // Right edge
                left = 85 + Math.random() * 15; // Only in last 15% from right
                top = Math.random() * 100;
                break;
            case 2: // Top edge
                left = Math.random() * 100;
                top = Math.random() * 15; // Only in first 15% from top
                break;
            case 3: // Bottom edge
                left = Math.random() * 100;
                top = 85 + Math.random() * 15; // Only in last 15% from bottom
                break;
        }

        // Extra check to avoid the central area completely
        const isInCenterX = left > 20 && left < 80;
        const isInCenterY = top > 20 && top < 80;

        // If it's in both center X and center Y, reposition to the nearest edge
        if (isInCenterX && isInCenterY) {
            // Find the closest edge
            const distToLeft = left;
            const distToRight = 100 - left;
            const distToTop = top;
            const distToBottom = 100 - top;

            // Find the minimum distance
            const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

            // Move to the closest edge
            if (minDist === distToLeft) {
                left = Math.random() * 15;
            } else if (minDist === distToRight) {
                left = 85 + Math.random() * 15;
            } else if (minDist === distToTop) {
                top = Math.random() * 15;
            } else {
                top = 85 + Math.random() * 15;
            }
        }

        // Add z-position for 3D effect based on depth layer
        const zPos = depthLayer === 'foreground' ? Math.random() * 100 :
            depthLayer === 'midground' ? Math.random() * -100 :
                Math.random() * -200 - 100; // background even further

        // Base random velocities - slower speeds for background particles
        const speedFactor = depthLayer === 'foreground' ? 1 :
            depthLayer === 'midground' ? 0.7 : 0.4;
        const vx = (Math.random() - 0.5) * 0.05 * speedFactor;
        const vy = (Math.random() - 0.5) * 0.05 * speedFactor;

        // Store properties in dataset for animation
        particle.dataset.x = left;
        particle.dataset.y = top;
        particle.dataset.z = zPos;
        particle.dataset.vx = vx;
        particle.dataset.vy = vy;
        particle.dataset.layer = depthLayer;

        // Apply size scaling based on z-position for perspective effect
        const scale = depthLayer === 'foreground' ? 1.2 :
            depthLayer === 'midground' ? 1 : 0.7;

        // Set initial position and transform
        particle.style.left = `${left}%`;
        particle.style.top = `${top}%`;
        particle.style.transform = `translateZ(${zPos}px) scale(${scale})`;

        // Add random blur effect for glass-like feel - more blur for background particles
        const blurFactor = depthLayer === 'foreground' ? 0.5 :
            depthLayer === 'midground' ? 1 : 1.5;
        const blur = (Math.random() * 1 + 0.5) * blurFactor;
        particle.style.filter = `blur(${blur}px)`;

        // Add particle to container
        particlesContainer.appendChild(particle);
    }
}

// Animate particles
function animateParticles() {
    const particles = document.querySelectorAll('.particle');

    particles.forEach(particle => {
        // Get current position and velocity
        let x = parseFloat(particle.dataset.x);
        let y = parseFloat(particle.dataset.y);
        let vx = parseFloat(particle.dataset.vx);
        let vy = parseFloat(particle.dataset.vy);

        // Update position
        x += vx;
        y += vy;

        // Bounce off edges with slight randomization
        if (x < 0 || x > 100) {
            vx = -vx * 0.9;
            x = x < 0 ? 0 : 100;

            // Add slight random variation after bounce
            vx += (Math.random() - 0.5) * 0.01;
        }

        if (y < 0 || y > 100) {
            vy = -vy * 0.9;
            y = y < 0 ? 0 : 100;

            // Add slight random variation after bounce
            vy += (Math.random() - 0.5) * 0.01;
        }

        // Apply subtle gravitational effect toward center
        const centerX = 50;
        const centerY = 50;
        const dx = centerX - x;
        const dy = centerY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 30) {
            // Weak gravity toward center when far away
            vx += dx * 0.0001;
            vy += dy * 0.0001;
        }

        // Apply slight randomization for natural movement
        vx += (Math.random() - 0.5) * 0.001;
        vy += (Math.random() - 0.5) * 0.001;

        // Limit max velocity
        const maxVel = 0.1;
        vx = Math.max(-maxVel, Math.min(maxVel, vx));
        vy = Math.max(-maxVel, Math.min(maxVel, vy));

        // Update particle data and position
        particle.dataset.x = x;
        particle.dataset.y = y;
        particle.dataset.vx = vx;
        particle.dataset.vy = vy;

        particle.style.left = `${x}%`;
        particle.style.top = `${y}%`;
    });

    requestAnimationFrame(animateParticles);
}

// Initialize particles on window load and resize
window.addEventListener('load', () => {
    createParticles();
    animateParticles();
});

window.addEventListener('resize', () => {
    createParticles(); // Recreate particles on resize for responsiveness
});
// Disclaimer Box Management
document.addEventListener('DOMContentLoaded', function () {
    // Check if disclaimer has been closed before
    const disclaimerClosed = localStorage.getItem('disclaimerClosed');
    const disclaimer = document.getElementById('disclaimer');
    const disclaimerClose = document.getElementById('disclaimerClose');

    if (disclaimerClosed === 'true') {
        disclaimer.style.display = 'none';
    }

    disclaimerClose.addEventListener('click', function () {
        disclaimer.style.display = 'none';
        localStorage.setItem('disclaimerClosed', 'true');
    });
});
function startVisualizer(stream) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Clear existing visualizer bars
        elements.voiceVisualizer.innerHTML = '';

        // Create visualizer bars dynamically
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'voice-visualizer-bar';
            elements.voiceVisualizer.appendChild(bar);
        }

        function updateVisualizer() {
            if (!state.voiceAssistant.isRecording) return;

            analyser.getByteFrequencyData(dataArray);
            const bars = elements.voiceVisualizer.children;
            const barCount = bars.length;

            // Use a fraction of the frequency data
            const step = Math.floor(bufferLength / barCount);

            for (let i = 0; i < barCount; i++) {
                const value = dataArray[i * step];
                const height = Math.max(5, (value / 255) * 100);
                bars[i].style.height = `${height}%`;
            }

            state.voiceAssistant.visualizerAnimation = requestAnimationFrame(updateVisualizer);
        }

        updateVisualizer();
    } catch (error) {
        console.error('Visualizer error:', error);
    }
}

function stopVisualizer() {
    if (state.voiceAssistant.visualizerAnimation) {
        cancelAnimationFrame(state.voiceAssistant.visualizerAnimation);
        state.voiceAssistant.visualizerAnimation = null;
    }

    // Reset visualizer bars
    const bars = elements.voiceVisualizer.children;
    for (let i = 0; i < bars.length; i++) {
        bars[i].style.height = '5%';
    }
}

// Helper function to manage all side menu triggers
function updateSideMenuTriggers(displayStyle, addPulse = false) {
    // Get all side menu trigger buttons (both in the container and the original)
    const allTriggers = document.querySelectorAll('.side-menu-trigger');

    allTriggers.forEach(trigger => {
        trigger.style.display = displayStyle;

        if (addPulse) {
            trigger.classList.add('pulse');
            setTimeout(() => trigger.classList.remove('pulse'), 1500);
        } else {
            trigger.classList.remove('pulse');
        }
    });
}
// Enhanced Mobile Support
function setupMobileInteractions() {
    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
        // Small delay to ensure DOM catches up with orientation change
        setTimeout(() => {
            adjustLayoutForOrientation();
        }, 100);
    });

    // Add touch feedback to buttons
    document.querySelectorAll('.btn, .side-menu-trigger, .back-button, .github-btn')
        .forEach(btn => {
            btn.addEventListener('touchstart', () => {
                btn.classList.add('touch-active');
            }, { passive: true });

            btn.addEventListener('touchend', () => {
                btn.classList.remove('touch-active');
            }, { passive: true });
        });

    // Add visual feedback on form interactions for mobile
    elements.uploadArea.addEventListener('touchstart', () => {
        elements.uploadArea.classList.add('touch-focus');
    }, { passive: true });

    elements.uploadArea.addEventListener('touchend', () => {
        elements.uploadArea.classList.remove('touch-focus');
    }, { passive: true });

    // Handle drag visual feedback
    elements.uploadArea.addEventListener('dragenter', () => {
        elements.uploadArea.classList.add('dragover');
    });

    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('dragover');
    });

    elements.uploadArea.addEventListener('drop', () => {
        elements.uploadArea.classList.remove('dragover');
    });

    // Handle loading state
    elements.processBtn.addEventListener('click', () => {
        if (!elements.processBtn.disabled && !state.isProcessing) {
            elements.processBtn.classList.add('loading');
            // The loading class will be removed when processing is complete
        }
    });

    // Check for iOS devices and add special handling
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        document.body.classList.add('ios-device');

        // Add viewport meta tag for iOS notch handling
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        document.head.appendChild(meta);
    }
}

// Adjust layout based on orientation
function adjustLayoutForOrientation() {
    const isLandscape = window.innerWidth > window.innerHeight;

    if (isLandscape && window.innerWidth <= 768) {
        document.body.classList.add('landscape');
        document.body.classList.remove('portrait');
    } else {
        document.body.classList.remove('landscape');
        document.body.classList.add('portrait');
    }

    // Additional adjustments based on orientation if needed
}

// Initialize mobile interactions
document.addEventListener('DOMContentLoaded', function () {
    setupMobileInteractions();
    adjustLayoutForOrientation();
});