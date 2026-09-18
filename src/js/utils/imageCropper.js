// Simple image cropper utility - no external dependencies
// Supports drag, resize, preview, and export to blob

export class ImageCropper {
  constructor(options = {}) {
    this.aspectRatio = options.aspectRatio || 16/9; // default for trip cover
    this.minWidth = options.minWidth || 100;
    this.container = null;
    this.image = null;
    this.canvas = null;
    this.ctx = null;
    this.cropArea = { x: 0, y: 0, width: 0, height: 0 };
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.dragStart = { x: 0, y: 0 };
    this.originalImage = null;
    this.onChange = options.onChange || null;
  }

  // Load image file and initialize cropper in container
  async loadFile(file, containerEl) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.loadImage(e.target.result, containerEl).then(resolve).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async loadImage(src, containerEl) {
    return new Promise((resolve, reject) => {
      this.container = containerEl;
      this.container.innerHTML = '';
      this.container.style.position = 'relative';
      this.container.style.overflow = 'hidden';
      this.container.style.background = '#000';
      this.container.style.touchAction = 'none';
      
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;
        this.setupCanvas(img);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  setupCanvas(img) {
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.minHeight = '300px';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.background = '#1a1a1a';
    
    // Create canvas for display
    this.canvas = document.createElement('canvas');
    this.canvas.style.maxWidth = '100%';
    this.canvas.style.maxHeight = '400px';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'move';
    
    const ctx = this.canvas.getContext('2d');
    this.ctx = ctx;
    
    // Calculate display size preserving aspect
    const containerWidth = this.container.clientWidth || 400;
    const containerHeight = 400;
    let displayWidth = img.width;
    let displayHeight = img.height;
    
    const scale = Math.min(containerWidth / img.width, containerHeight / img.height, 1);
    displayWidth = img.width * scale;
    displayHeight = img.height * scale;
    
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
    this.canvas.style.width = displayWidth + 'px';
    this.canvas.style.height = displayHeight + 'px';
    
    // Store scale factor for cropping
    this.displayScale = scale;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    
    // Initial crop area - centered, respecting aspect ratio
    const cropWidth = displayWidth * 0.8;
    const cropHeight = cropWidth / this.aspectRatio;
    const finalCropHeight = Math.min(cropHeight, displayHeight * 0.8);
    const finalCropWidth = finalCropHeight * this.aspectRatio;
    
    this.cropArea = {
      x: (displayWidth - finalCropWidth) / 2,
      y: (displayHeight - finalCropHeight) / 2,
      width: finalCropWidth,
      height: finalCropHeight
    };
    
    wrapper.appendChild(this.canvas);
    this.container.appendChild(wrapper);
    
    this.draw();
    this.attachEvents();
  }

  draw() {
    if (!this.canvas || !this.originalImage) return;
    
    const ctx = this.ctx;
    const img = this.originalImage;
    const { x, y, width, height } = this.cropArea;
    
    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw image
    ctx.drawImage(img, 0, 0, this.displayWidth, this.displayHeight);
    
    // Draw overlay (darken outside crop)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Clear crop area (show original image there)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(x, y, width, height);
    ctx.restore();
    
    // Draw image again in crop area
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(img, 0, 0, this.displayWidth, this.displayHeight);
    ctx.restore();
    
    // Draw crop border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    // Draw grid (rule of thirds)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(x + width/3, y);
    ctx.lineTo(x + width/3, y + height);
    ctx.moveTo(x + 2*width/3, y);
    ctx.lineTo(x + 2*width/3, y + height);
    // Horizontal lines
    ctx.moveTo(x, y + height/3);
    ctx.lineTo(x + width, y + height/3);
    ctx.moveTo(x, y + 2*height/3);
    ctx.lineTo(x + width, y + 2*height/3);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw handles
    const handles = this.getHandles();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#8bb89a';
    ctx.lineWidth = 2;
    handles.forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    });
    
    if (this.onChange) this.onChange(this.cropArea);
  }

  getHandles() {
    const { x, y, width, height } = this.cropArea;
    return [
      { x: x, y: y, type: 'nw' },
      { x: x + width, y: y, type: 'ne' },
      { x: x + width, y: y + height, type: 'se' },
      { x: x, y: y + height, type: 'sw' },
      { x: x + width/2, y: y, type: 'n' },
      { x: x + width, y: y + height/2, type: 'e' },
      { x: x + width/2, y: y + height, type: 's' },
      { x: x, y: y + height/2, type: 'w' },
    ];
  }

  attachEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const isInHandle = (pos, handle) => {
      const dx = pos.x - handle.x;
      const dy = pos.y - handle.y;
      return Math.sqrt(dx*dx + dy*dy) < 12;
    };

    const isInCrop = (pos) => {
      return pos.x >= this.cropArea.x && pos.x <= this.cropArea.x + this.cropArea.width &&
             pos.y >= this.cropArea.y && pos.y <= this.cropArea.y + this.cropArea.height;
    };

    const onStart = (e) => {
      e.preventDefault();
      const pos = getPos(e);
      const handles = this.getHandles();
      
      // Check handles first
      for (const h of handles) {
        if (isInHandle(pos, h)) {
          this.isResizing = true;
          this.resizeHandle = h.type;
          this.dragStart = { x: pos.x, y: pos.y, crop: {...this.cropArea} };
          return;
        }
      }
      
      // Check if inside crop area for dragging
      if (isInCrop(pos)) {
        this.isDragging = true;
        this.dragStart = { x: pos.x - this.cropArea.x, y: pos.y - this.cropArea.y };
      }
    };

    const onMove = (e) => {
      e.preventDefault();
      const pos = getPos(e);
      
      if (this.isDragging) {
        let newX = pos.x - this.dragStart.x;
        let newY = pos.y - this.dragStart.y;
        
        // Clamp to canvas bounds
        newX = Math.max(0, Math.min(newX, this.canvas.width - this.cropArea.width));
        newY = Math.max(0, Math.min(newY, this.canvas.height - this.cropArea.height));
        
        this.cropArea.x = newX;
        this.cropArea.y = newY;
        this.draw();
      } else if (this.isResizing) {
        const dx = pos.x - this.dragStart.x;
        const dy = pos.y - this.dragStart.y;
        const orig = this.dragStart.crop;
        let newCrop = { ...orig };
        
        // Handle resizing based on handle type
        if (this.resizeHandle.includes('e')) {
          newCrop.width = Math.max(this.minWidth, orig.width + dx);
          if (this.aspectRatio) newCrop.height = newCrop.width / this.aspectRatio;
        }
        if (this.resizeHandle.includes('s')) {
          newCrop.height = Math.max(this.minWidth / this.aspectRatio, orig.height + dy);
          if (this.aspectRatio) newCrop.width = newCrop.height * this.aspectRatio;
        }
        if (this.resizeHandle.includes('w')) {
          const newWidth = Math.max(this.minWidth, orig.width - dx);
          newCrop.x = orig.x + (orig.width - newWidth);
          newCrop.width = newWidth;
          if (this.aspectRatio) newCrop.height = newWidth / this.aspectRatio;
        }
        if (this.resizeHandle.includes('n')) {
          const newHeight = Math.max(this.minWidth / this.aspectRatio, orig.height - dy);
          newCrop.y = orig.y + (orig.height - newHeight);
          newCrop.height = newHeight;
          if (this.aspectRatio) newCrop.width = newHeight * this.aspectRatio;
        }
        
        // Clamp to bounds
        newCrop.x = Math.max(0, Math.min(newCrop.x, this.canvas.width - newCrop.width));
        newCrop.y = Math.max(0, Math.min(newCrop.y, this.canvas.height - newCrop.height));
        newCrop.width = Math.min(newCrop.width, this.canvas.width - newCrop.x);
        newCrop.height = Math.min(newCrop.height, this.canvas.height - newCrop.y);
        
        // Maintain aspect ratio if needed
        if (this.aspectRatio) {
          if (newCrop.width / newCrop.height !== this.aspectRatio) {
            if (this.resizeHandle === 'n' || this.resizeHandle === 's') {
              newCrop.width = newCrop.height * this.aspectRatio;
            } else {
              newCrop.height = newCrop.width / this.aspectRatio;
            }
          }
        }
        
        this.cropArea = newCrop;
        this.draw();
      }
    };

    const onEnd = () => {
      this.isDragging = false;
      this.isResizing = false;
      this.resizeHandle = null;
    };

    // Mouse events
    this.canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    
    // Touch events
    this.canvas.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    // Store for cleanup
    this._events = { onStart, onMove, onEnd };
  }

  destroy() {
    if (this.canvas && this._events) {
      this.canvas.removeEventListener('mousedown', this._events.onStart);
      window.removeEventListener('mousemove', this._events.onMove);
      window.removeEventListener('mouseup', this._events.onEnd);
      this.canvas.removeEventListener('touchstart', this._events.onStart);
      window.removeEventListener('touchmove', this._events.onMove);
      window.removeEventListener('touchend', this._events.onEnd);
    }
  }

  // Get cropped blob
  async getCroppedBlob(type = 'image/webp', quality = 0.85) {
    if (!this.originalImage) return null;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Calculate crop in original image coordinates
    const scaleX = this.originalImage.width / this.displayWidth;
    const scaleY = this.originalImage.height / this.displayHeight;
    
    const sx = this.cropArea.x * scaleX;
    const sy = this.cropArea.y * scaleY;
    const sWidth = this.cropArea.width * scaleX;
    const sHeight = this.cropArea.height * scaleY;
    
    // Set output canvas size (max 1280 width)
    const maxOutputWidth = 1280;
    let outputWidth = sWidth;
    let outputHeight = sHeight;
    
    if (outputWidth > maxOutputWidth) {
      const ratio = maxOutputWidth / outputWidth;
      outputWidth = maxOutputWidth;
      outputHeight = sHeight * ratio;
    }
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
    // Draw cropped area
    ctx.drawImage(
      this.originalImage,
      sx, sy, sWidth, sHeight,
      0, 0, outputWidth, outputHeight
    );
    
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), type, quality);
    });
  }

  // Get preview data URL
  getPreviewDataUrl(maxWidth = 400) {
    if (!this.originalImage) return null;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const scaleX = this.originalImage.width / this.displayWidth;
    const scaleY = this.originalImage.height / this.displayHeight;
    
    const sx = this.cropArea.x * scaleX;
    const sy = this.cropArea.y * scaleY;
    const sWidth = this.cropArea.width * scaleX;
    const sHeight = this.cropArea.height * scaleY;
    
    let outputWidth = sWidth;
    let outputHeight = sHeight;
    
    if (outputWidth > maxWidth) {
      const ratio = maxWidth / outputWidth;
      outputWidth = maxWidth;
      outputHeight = sHeight * ratio;
    }
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
    ctx.drawImage(
      this.originalImage,
      sx, sy, sWidth, sHeight,
      0, 0, outputWidth, outputHeight
    );
    
    return canvas.toDataURL('image/webp', 0.8);
  }
}

// Helper function to create cropper UI in bottom sheet
export function createCropperUI(file, options = {}) {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '400px';
    container.style.borderRadius = '16px';
    container.style.overflow = 'hidden';
    
    const cropper = new ImageCropper({
      aspectRatio: options.aspectRatio || 16/9,
      onChange: options.onChange
    });
    
    cropper.loadFile(file, container).then(() => {
      resolve({ cropper, container });
    }).catch(reject);
  });
}
