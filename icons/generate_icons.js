/**
 * Icon Generator for Google Flow Automation Pro
 * Run this in browser console or as a bookmarklet to generate icons
 */

function generateIcons() {
  const sizes = [16, 32, 48, 128];
  
  sizes.forEach(size => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#6366F1');
    gradient.addColorStop(1, '#8B5CF6');
    
    // Draw rounded rectangle
    const radius = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Add subtle inner shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = size * 0.1;
    ctx.shadowOffsetY = size * 0.05;
    
    // Draw checkmark
    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'transparent';
    
    ctx.beginPath();
    ctx.moveTo(size * 0.25, size * 0.52);
    ctx.lineTo(size * 0.42, size * 0.68);
    ctx.lineTo(size * 0.75, size * 0.32);
    ctx.stroke();
    
    // Output as data URL
    const dataUrl = canvas.toDataURL('image/png');
    console.log(`icon${size}.png:`, dataUrl);
    
    // Create download link
    const link = document.createElement('a');
    link.download = `icon${size}.png`;
    link.href = dataUrl;
    link.click();
  });
}

// Run if in browser
if (typeof document !== 'undefined') {
  generateIcons();
}

