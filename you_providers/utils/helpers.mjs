import {v4 as uuidV4} from "uuid";

export function generateUUID() {
    return uuidV4();
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractCookie(cookies) {
    if (!cookies) return '';
    if (typeof cookies === 'string') return cookies;
    
    return cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
}

export function getSessionCookie(cookies) {
    if (!cookies) return null;
    const cookieArray = cookies.split(';').map(c => c.trim());
    const sessionCookie = cookieArray.find(c => c.startsWith('sessionKey='));
    return sessionCookie ? sessionCookie.split('=')[1] : null;
}

export function isValidResponse(response) {
    return response && response.status === 200 && response.data;
}

export function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>]/g, '');
}
