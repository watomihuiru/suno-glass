/**
 * @jest-environment jsdom
 */

// Polyfill for TextEncoder/TextDecoder (required by jsdom)
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
    resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.FormData = dom.window.FormData;

// Mock MODEL_LIMITS
global.MODEL_LIMITS = {
    V3_5: { prompt: 3000, style: 200, title: 80 },
    V4: { prompt: 3000, style: 200, title: 80 },
    V4_5: { prompt: 5000, style: 1000, title: 100 },
    V4_5PLUS: { prompt: 5000, style: 1000, title: 100 },
    V5: { prompt: 5000, style: 1000, title: 100 }
};

// Load validation module
// Note: validation.js uses conditional export for Node.js
// We need to ensure module.exports is available
const ValidationUtils = require('../../public/js/validation.js');

describe('ValidationUtils', () => {
    describe('getModelLimits', () => {
        it('should return limits for valid model', () => {
            const limits = ValidationUtils.getModelLimits('V5');
            expect(limits).toEqual({ prompt: 5000, style: 1000, title: 100 });
        });

        it('should return default limits for unknown model', () => {
            const limits = ValidationUtils.getModelLimits('UNKNOWN');
            // Should return V3_5 limits as fallback
            expect(limits).toEqual({ prompt: 3000, style: 200, title: 80 });
        });

        it('should return V3_5 limits as fallback', () => {
            const limits = ValidationUtils.getModelLimits(null);
            expect(limits).toEqual({ prompt: 3000, style: 200, title: 80 });
        });
    });

    describe('validateForm', () => {
        it('should validate simple mode form successfully', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'A test song description',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors).toHaveLength(0);
        });

        it('should require prompt in simple mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: '',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('Требуется описание песни в простом режиме');
        });

        it('should validate custom mode form successfully', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Song lyrics here',
                titleVal: 'My Song',
                styleVal: 'Pop',
                isCustom: true,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors).toHaveLength(0);
        });

        it('should require title in custom mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Song lyrics',
                titleVal: '',
                styleVal: 'Pop',
                isCustom: true,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('название') || e.includes('Title'))).toBe(true);
        });

        it('should require style in custom mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Song lyrics',
                titleVal: 'My Song',
                styleVal: '',
                isCustom: true,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('стиль') || e.includes('Style'))).toBe(true);
        });

        it('should require lyrics when vocals enabled in custom mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: '',
                titleVal: 'My Song',
                styleVal: 'Pop',
                isCustom: true,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('Текст песни') || e.includes('Lyrics'))).toBe(true);
        });

        it('should validate prompt length limits', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'a'.repeat(501), // Exceeds 500 char limit for non-custom
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('превышает') || e.includes('exceeds'))).toBe(true);
        });

        it('should validate title length limits', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Song lyrics',
                titleVal: 'a'.repeat(101), // Exceeds 100 char limit for V5
                styleVal: 'Pop',
                isCustom: true,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => (e.includes('Название') || e.includes('Title')) && (e.includes('символов') || e.includes('characters')))).toBe(true);
        });

        it('should validate style length limits', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Song lyrics',
                titleVal: 'My Song',
                styleVal: 'a'.repeat(1001), // Exceeds 1000 char limit for V5
                isCustom: true,
                isInstrumental: false
            };

            const errors = ValidationUtils.validateForm(formData, 'generate');
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => (e.includes('Стиль') || e.includes('Style')) && (e.includes('превышает') || e.includes('exceeds')))).toBe(true);
        });
    });

    describe('validateExtendForm', () => {
        it('should validate extend form successfully', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Extend the song',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false,
                continueAtRaw: '30.5'
            };

            const errors = ValidationUtils.validateExtendForm(formData);
            expect(errors).toHaveLength(0);
        });

        it('should require continueAt for extend form', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Extend the song',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false,
                continueAtRaw: ''
            };

            const errors = ValidationUtils.validateExtendForm(formData);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('extension point'))).toBe(true);
        });

        it('should validate continueAt is a number', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Extend the song',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false,
                continueAtRaw: 'invalid'
            };

            const errors = ValidationUtils.validateExtendForm(formData);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('should validate continueAt is greater than 0', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Extend the song',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false,
                continueAtRaw: '0'
            };

            const errors = ValidationUtils.validateExtendForm(formData);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('greater than 0'))).toBe(true);
        });
    });

    describe('validateAudioFile', () => {
        it('should validate valid audio file', () => {
            const file = {
                type: 'audio/mpeg',
                size: 5 * 1024 * 1024 // 5MB
            };

            const isValid = ValidationUtils.validateAudioFile(file);
            expect(isValid).toBe(true);
        });

        it('should reject file larger than 10MB', () => {
            const file = {
                type: 'audio/mpeg',
                size: 11 * 1024 * 1024 // 11MB
            };

            const isValid = ValidationUtils.validateAudioFile(file);
            expect(isValid).toBe(false);
        });

        it('should reject non-audio file', () => {
            const file = {
                type: 'image/jpeg',
                size: 5 * 1024 * 1024
            };

            const isValid = ValidationUtils.validateAudioFile(file);
            expect(isValid).toBe(false);
        });

        it('should return false for null file', () => {
            const isValid = ValidationUtils.validateAudioFile(null);
            expect(isValid).toBe(false);
        });
    });

    describe('buildApiPayload', () => {
        it('should build payload for simple mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'A test song',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false,
                continueAtRaw: ''
            };

            const payload = ValidationUtils.buildApiPayload(formData, 'generate');

            expect(payload).toMatchObject({
                model: 'V5',
                customMode: false,
                instrumental: false,
                prompt: 'A test song'
            });
            expect(payload).not.toHaveProperty('title');
            expect(payload).not.toHaveProperty('style');
        });

        it('should build payload for custom mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Song lyrics',
                titleVal: 'My Song',
                styleVal: 'Pop',
                isCustom: true,
                isInstrumental: false,
                continueAtRaw: ''
            };

            const payload = ValidationUtils.buildApiPayload(formData, 'generate');

            expect(payload).toMatchObject({
                model: 'V5',
                customMode: true,
                instrumental: false,
                prompt: 'Song lyrics',
                title: 'My Song',
                style: 'Pop'
            });
        });

        it('should build payload for extend mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Extend the song',
                titleVal: '',
                styleVal: '',
                isCustom: false,
                isInstrumental: false,
                continueAtRaw: '30.5'
            };

            const payload = ValidationUtils.buildApiPayload(formData, 'extend');

            expect(payload).toMatchObject({
                model: 'V5',
                customMode: false,
                continueAt: 30.5,
                defaultParamFlag: false
            });
        });

        it('should include prompt for instrumental in custom mode', () => {
            const formData = {
                modelVal: 'V5',
                promptVal: 'Instrumental description',
                titleVal: 'My Song',
                styleVal: 'Pop',
                isCustom: true,
                isInstrumental: true,
                continueAtRaw: ''
            };

            const payload = ValidationUtils.buildApiPayload(formData, 'generate');

            expect(payload).toHaveProperty('prompt');
            expect(payload.prompt).toBe('Instrumental description');
        });
    });

    describe('addAdvancedParams', () => {
        afterEach(() => {
            document.body.innerHTML = '';
        });

        it('should copy advanced settings for generate mode', () => {
            document.body.innerHTML = `
                <input id="negativeTags" value="no drums">
                <input id="genStyleWeight" data-touched="true" value="0.8">
                <input id="genAudioWeight" data-touched="true" value="0.6">
                <input id="genWeirdness" data-touched="true" value="0.2">
                <input id="vocalGender" type="hidden" value="f">
            `;

            const payload = {
                customMode: true,
                instrumental: false
            };

            const result = ValidationUtils.addAdvancedParams(payload, 'generate');

            expect(result).toMatchObject({
                negativeTags: 'no drums',
                styleWeight: 0.8,
                audioWeight: 0.6,
                weirdnessConstraint: 0.2,
                vocalGender: 'f'
            });
        });

        it('should respect mode-specific field ids and skip untouched sliders', () => {
            document.body.innerHTML = `
                <input id="coverNegativeTags" value="no bass">
                <input id="styleWeight" data-touched="false" value="0.5">
                <input id="audioWeight" data-touched="true" value="0.45">
                <input id="weirdness" value="0.3">
                <input id="coverVocalGender" type="hidden" value="m">
            `;

            const payload = {
                customMode: false,
                instrumental: true
            };

            const result = ValidationUtils.addAdvancedParams(payload, 'cover');

            expect(result).toMatchObject({
                negativeTags: 'no bass',
                audioWeight: 0.45
            });
            expect(result).not.toHaveProperty('styleWeight');
            expect(result).not.toHaveProperty('weirdnessConstraint');
            expect(result).not.toHaveProperty('vocalGender');
        });
    });
});

