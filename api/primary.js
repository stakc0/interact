import handler from './[...path].js';
export default function primary(req, res) { req.url = '/api/primary'; return handler(req, res); }
