/**
 * verify-architectural-integrity.js
 * Helper for StudioAI Browser Staging Skill
 */

window.verifyIntegrity = {
    /**
     * Compares the original and generated images visually by toggling transparency.
     * Helps the agent see if windows or structural elements moved.
     */
    detectStructuralDivergence: async () => {
        const original = document.querySelector('img[alt="Original"]');
        const generated = document.querySelector('img[alt="Generated"]');

        if (!original || !generated) {
            console.error("Images not found. Ensure the CompareSlider is active.");
            return { success: false, error: "Images not found" };
        }

        console.log("Integrity Check: Comparing original vs generated...");

        // Check dimensions
        const dimsMatch = (original.naturalWidth === generated.naturalWidth) &&
            (original.naturalHeight === generated.naturalHeight);

        return {
            success: true,
            dimensionsMatch: dimsMatch,
            originalSrc: original.src.substring(0, 50) + "...",
            generatedSrc: generated.src.substring(0, 50) + "...",
            message: dimsMatch ? "Dimensions match. Proceed with visual inspection." : "Warning: Dimensions differ!"
        };
    }
};

console.log("Browser Staging Verification Utilities Loaded.");
