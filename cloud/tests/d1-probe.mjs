import {handleApi} from '../api.mjs';
// Local workerd/D1 probe only. This file is not imported by worker.mjs.
export default {fetch:handleApi};
