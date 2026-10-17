import handler from './[...path].js';
export default function tokens(req, res) { req.url = '/api/tokens'; return handler(req, res); }
