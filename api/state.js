import handler from './[...path].js';
export default function state(req, res) { req.url = '/api/state'; return handler(req, res); }
