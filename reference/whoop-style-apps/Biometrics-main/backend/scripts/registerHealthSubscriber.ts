// One-time ops script: registers the project-level Google Health API subscriber.
//
// This is NOT part of the request path and is not imported by any application
// code. Registering the project-level subscriber (as opposed to a per-user
// subscription — see src/health/subscriber.ts) is a one-time setup action
// confirmed in the spec's live verification; it is run manually, once, by an
// operator, e.g.:
//
//   npx ts-node scripts/registerHealthSubscriber.ts
//
// Required environment variables:
//   GOOGLE_CLOUD_PROJECT_NUMBER  - the GCP project number
//   GOOGLE_HEALTH_WEBHOOK_URL    - e.g. https://api.yourdomain.com/webhooks/health
//   GOOGLE_HEALTH_WEBHOOK_SECRET - e.g. "Bearer <random-value>"
import fetch from 'node-fetch';
import { getServiceAccountToken } from '../src/health/serviceAccount';

const SUBSCRIBER_ID = 'biometrics-subscriber';

async function main() {
  const projectNumber = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  const webhookUrl = process.env.GOOGLE_HEALTH_WEBHOOK_URL; // e.g. https://api.yourdomain.com/webhooks/health
  const webhookSecret = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET; // e.g. "Bearer <random-value>"
  if (!projectNumber || !webhookUrl || !webhookSecret) {
    throw new Error('GOOGLE_CLOUD_PROJECT_NUMBER, GOOGLE_HEALTH_WEBHOOK_URL, and GOOGLE_HEALTH_WEBHOOK_SECRET must be set');
  }

  const token = await getServiceAccountToken();
  const res = await fetch(
    `https://health.googleapis.com/v4/projects/${projectNumber}/subscribers?subscriberId=${SUBSCRIBER_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpointUri: webhookUrl,
        endpointAuthorization: { secret: webhookSecret },
        subscriberConfigs: [
          { dataTypes: ['steps', 'sleep', 'heart-rate', 'heart-rate-variability'], subscriptionCreatePolicy: 'MANUAL' },
        ],
      }),
    },
  );

  const body = await res.json();
  if (!res.ok) {
    console.error('Failed to register subscriber:', JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log('Subscriber registered:', JSON.stringify(body, null, 2));
}

main();
