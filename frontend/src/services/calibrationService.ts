export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = 'tiktok-ocr-crop-settings';

export class CalibrationService {
  saveCropSettings(settings: CropSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  loadCropSettings(): CropSettings | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  clearCropSettings(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  getDefaultSettings(videoWidth: number, videoHeight: number): CropSettings {
    return {
      x: Math.floor(videoWidth * 0.82),
      y: 5,
      width: Math.floor(videoWidth * 0.17),
      height: 60
    };
  }
}

export const calibrationService = new CalibrationService();
