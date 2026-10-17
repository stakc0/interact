import handler from '../../[...path].js';
export default function prepare(req, res) { req.url = '/api/launch/prepare'; return handler(req, res); }
