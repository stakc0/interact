import handler from '../../[...path].js';
export default function check(req, res) { req.url = '/api/interaction/check'; return handler(req, res); }
