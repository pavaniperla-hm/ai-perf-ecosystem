import http from 'k6/http';
import { sleep } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { BASE } from '../config/config.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export const options = {
  vus: 1,
  duration: '5s',
};

export default function () {
  http.get(`${BASE}/health`);
  sleep(1);
}

export function handleSummary(data) {
  return {
    'k6/results/01-hello-k6-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
