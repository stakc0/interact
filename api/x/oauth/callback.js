import handler from '../../[...path].js';
export default function callback(req, res) { req.url = '/api/x/oauth/callback' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); return handler(req, res); }
