import { useState, useRef } from "react";

export default function ImageUpload({ onImageSelect, disabled }) {
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be less than 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl);
      onImageSelect({ file, dataUrl, name: file.name, type: file.type, size: file.size });
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    if (!disabled) setDragActive(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setDragActive(false);
  }

  function handleFileInput(e) {
    const file = e.target.files[0];
    handleFile(file);
    e.target.value = "";
  }

  function removeImage() {
    setPreview(null);
    onImageSelect(null);
  }

  if (disabled) return null;

  return (
    <div className="image-upload">
      <div
        className={`image-upload__dropzone ${dragActive ? "is-drag-active" : ""} ${preview ? "has-preview" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {preview ? (
          <>
            <img src={preview} alt="Preview" className="image-upload__preview" />
            <button type="button" className="image-upload__remove" onClick={(e) => { e.stopPropagation(); removeImage(); }}>
              ✕
            </button>
          </>
        ) : (
          <div className="image-upload__placeholder">
            <span className="image-upload__icon">🖼️</span>
            <span>Drop image here or click to upload</span>
            <span className="image-upload__hint">PNG, JPG, WebP · Max 10MB</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="image-upload__input"
        />
      </div>
    </div>
  );
}