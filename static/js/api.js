async function processFile() {
    if (!state.currentFile || state.isProcessing) return;

    state.isProcessing = true;
    updateControls();
    elements.processBtn.classList.add('loading'); // Add loading state to button
    elements.loader.style.display = 'flex';

    // Add loading tips
    const loadingTips = [
        "Analyzing image content...",
        "Detecting objects in the scene...",
        "Processing visual elements...",
        "Identifying scene context..."
    ];
    const loaderTipElement = document.getElementById('loaderTip');
    let tipIndex = 0;

    // Show different tips during loading
    if (loaderTipElement) {
        const tipInterval = setInterval(() => {
            tipIndex = (tipIndex + 1) % loadingTips.length;
            loaderTipElement.textContent = loadingTips[tipIndex];
            loaderTipElement.style.opacity = 0;
            setTimeout(() => {
                loaderTipElement.style.opacity = 1;
            }, 200);
        }, 3000);

        // Clean up interval when done
        setTimeout(() => clearInterval(tipInterval), 20000); // Safety cleanup after 20s
    }

    try {
        const formData = new FormData();
        formData.append('file', state.currentFile);

        const response = await fetch(`/vior-${state.currentTab}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Processing failed');

        const data = await response.json();

        const scenarioResponse = await fetch('https://myra-chatbot.vercel.app/scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (scenarioResponse.ok) {
            const scenarioData = await scenarioResponse.json();
            displayScenario(scenarioData.description);
            await getAudioForScenario(scenarioData.description);
        }

        displayDetections(data.detections);

        // Show results section with animation
        elements.resultsSection.style.display = 'block';
        elements.resultsSection.style.opacity = 0;
        elements.resultsSection.style.transform = 'translateY(20px)';

        // Use animation frame for smoother animation
        requestAnimationFrame(() => {
            elements.resultsSection.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            elements.resultsSection.style.opacity = 1;
            elements.resultsSection.style.transform = 'translateY(0)';
        });

        // Scroll to results section with smooth animation
        setTimeout(() => {
            const isSmallScreen = window.innerWidth <= 768;
            // Use different scroll behavior on small screens for better performance
            const behavior = isSmallScreen ? 'smooth' : 'smooth';
            elements.resultsSection.scrollIntoView({ behavior, block: 'start' });
        }, 300);

        // Show and animate the side menu trigger buttons when results are available
        updateSideMenuTriggers('flex', true);

        showToast('Processing completed');

    } catch (error) {
        console.error('Error:', error);
        showToast('Error: ' + (error.message || 'Processing failed'), 'error');
        elements.sideMenuContent.innerHTML = `
                    <div class="detection-group">
                        <div class="detection-item">
                            <i class="fas fa-exclamation-circle"></i>
                            ${error.message || 'Processing failed'}
                        </div>
                    </div>
                `;
    } finally {
        if (loaderTipElement) {
            clearInterval(loaderTipElement._tipInterval);
        }
        state.isProcessing = false;
        updateControls();
        elements.processBtn.classList.remove('loading'); // Remove loading state
        elements.loader.style.display = 'none';
    }
}

// Audio Handling
async function getAudioForScenario(text) {
    try {
        elements.playBtn.disabled = true;
        elements.playBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const response = await fetch('https://myra-tts.vercel.app/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) throw new Error('TTS failed');

        // Get content type from response headers
        const contentType = response.headers.get('content-type');

        let audioUrl;
        if (contentType && contentType.includes('application/json')) {
            // Handle JSON response with base64 audio
            const data = await response.json();
            if (data.status !== 'success' || !data.audio) {
                throw new Error('Invalid TTS response');
            }
            audioUrl = `data:audio/mp3;base64,${data.audio}`;
        } else {
            // Handle direct audio blob response
            const audioBlob = await response.blob();
            audioUrl = URL.createObjectURL(audioBlob);
        }

        elements.audioPlayer.src = audioUrl;

        // Make sure AudioContext is ready
        await initAudioContext();

        // Add multiple event listeners to increase chances of successful autoplay
        // This is especially useful for different browser behaviors

        // Try to play as soon as metadata is loaded (faster than canplaythrough)
        elements.audioPlayer.onloadedmetadata = tryPlayAudio;

        // Also try when enough data is available to start playback
        elements.audioPlayer.oncanplay = tryPlayAudio;

        // And as a fallback, try when fully loaded
        elements.audioPlayer.oncanplaythrough = tryPlayAudio;

        // If audio is already loaded, try playing immediately
        if (elements.audioPlayer.readyState >= 2) {
            await tryPlayAudio();
        }

    } catch (error) {
        console.error('TTS Error:', error);
        showToast('Failed to generate audio');
        elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
    } finally {
        elements.playBtn.disabled = false;
    }
}
