import handler from '../../[...path].js';
export default function start(req, res) { req.url = '/api/x/oauth/start' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); return handler(req, res); }
