// cloudinary-config.js
// ==================== CLOUDINARY CONFIGURATION ====================
// REPLACE THESE WITH YOUR ACTUAL CLOUDINARY CREDENTIALS

const cloudinaryConfig = {
    // Your Cloudinary cloud name - found in Cloudinary Dashboard
    cloudName: 'dula8refj',
    
    // Your Cloudinary upload preset - create this in Cloudinary Settings > Upload
    uploadPreset: 'Requests',
    
    // Your Cloudinary API key (optional, only needed for signed uploads)
    apiKey: '',
    
    // Default folder for uploads
    folder: 'customer-uploads',
    
    // Allowed file types for upload
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
    
    // Allowed MIME types
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'],
    
    // Maximum file size in bytes (10MB)
    maxFileSize: 10 * 1024 * 1024,
    
    // Resource type mapping
    resourceType: function(file) {
        if (file.type === 'application/pdf') {
            return 'raw';
        }
        return 'image';
    }
};

// Export the config
if (typeof module !== 'undefined' && module.exports) {
    module.exports = cloudinaryConfig;
} else {
    // Make available globally in browser
    window.cloudinaryConfig = cloudinaryConfig;
}