import handler from '../../[...path].js';
export default function confirm(req, res) { req.url = '/api/launch/confirm'; return handler(req, res); }
