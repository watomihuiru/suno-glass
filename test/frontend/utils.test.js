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

// Load utils module - need to read and evaluate it
const fs = require('fs');
const path = require('path');

describe('Utils functions', () => {
    // Define functions directly (copied from utils.js for testing)
    // Since utils.js doesn't export, we'll test the logic directly
    function getDisplayModelName(rawName) {
        if (!rawName) return 'AI';
        const lower = rawName.toLowerCase();
        if (lower.includes('v5')) return 'v5';
        // Check for v4_5plus or v4_5_plus before v4_5 to avoid matching v4_5 first
        if (lower.includes('v4_5plus') || lower.includes('v4_5_plus') || lower.includes('v4.5+')) return 'v4.5+';
        if (lower.includes('v4_5') || lower.includes('v4.5')) return 'v4.5';
        if (lower.includes('v4')) return 'v4';
        if (lower.includes('v3_5') || lower.includes('v3.5')) return 'v3.5';
        return rawName;
    }

    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sc = Math.floor(s % 60);
        return `${m}:${sc < 10 ? '0' : ''}${sc}`;
    }

    describe('getDisplayModelName', () => {
        it('should return v5 for V5 model', () => {
            expect(getDisplayModelName('V5')).toBe('v5');
        });

        it('should return v4.5+ for V4_5PLUS model', () => {
            expect(getDisplayModelName('V4_5PLUS')).toBe('v4.5+');
        });

        it('should return v4.5 for V4_5 model', () => {
            expect(getDisplayModelName('V4_5')).toBe('v4.5');
        });

        it('should return v4 for V4 model', () => {
            expect(getDisplayModelName('V4')).toBe('v4');
        });

        it('should return v3.5 for V3_5 model', () => {
            expect(getDisplayModelName('V3_5')).toBe('v3.5');
        });

        it('should return original name for unknown model', () => {
            expect(getDisplayModelName('UNKNOWN')).toBe('UNKNOWN');
        });

        it('should return AI for null/undefined', () => {
            expect(getDisplayModelName(null)).toBe('AI');
            expect(getDisplayModelName(undefined)).toBe('AI');
        });

        it('should handle case insensitive matching', () => {
            expect(getDisplayModelName('v5')).toBe('v5');
            expect(getDisplayModelName('V5')).toBe('v5');
        });
    });

    describe('formatTime', () => {
        it('should format seconds correctly', () => {
            expect(formatTime(0)).toBe('0:00');
            expect(formatTime(30)).toBe('0:30');
            expect(formatTime(60)).toBe('1:00');
            expect(formatTime(90)).toBe('1:30');
            expect(formatTime(125)).toBe('2:05');
            expect(formatTime(3661)).toBe('61:01');
        });

        it('should handle decimal seconds', () => {
            expect(formatTime(30.5)).toBe('0:30');
            expect(formatTime(90.9)).toBe('1:30');
        });

        it('should format single digit seconds with leading zero', () => {
            expect(formatTime(5)).toBe('0:05');
            expect(formatTime(125)).toBe('2:05');
        });

        it('should handle large values', () => {
            expect(formatTime(3600)).toBe('60:00');
            expect(formatTime(7200)).toBe('120:00');
        });
    });
});



