import nock from 'nock';
import * as serviceAccount from '../../src/health/serviceAccount';
import { getIdentity, registerUserSubscription, deleteUserSubscription } from '../../src/health/subscriber';

jest.mock('../../src/health/serviceAccount');

beforeAll(() => {
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = '92059865078';
});

afterEach(() => nock.cleanAll());

describe('getIdentity', () => {
  it('resolves healthUserId using the end-user access token', async () => {
    nock('https://health.googleapis.com')
      .get('/v4/users/me/identity')
      .reply(200, { name: 'users/me/identity', legacyUserId: 'DCB3ZG', healthUserId: '8512524441117254421' });

    const identity = await getIdentity('user-access-token');
    expect(identity).toEqual({ healthUserId: '8512524441117254421' });
  });
});

describe('registerUserSubscription', () => {
  it('creates a subscription using the service account token and returns its ID', async () => {
    (serviceAccount.getServiceAccountToken as jest.Mock).mockResolvedValue('sa-token');
    nock('https://health.googleapis.com')
      .post('/v4/projects/92059865078/subscribers/biometrics-subscriber/subscriptions')
      .reply(200, {
        name: 'projects/92059865078/subscribers/biometrics-subscriber/subscriptions/sub-abc-123',
        dataTypes: ['users/8512524441117254421/dataTypes/steps'],
        user: 'users/8512524441117254421',
      });

    const subscriptionId = await registerUserSubscription('8512524441117254421');
    expect(subscriptionId).toBe('sub-abc-123');
  });
});

describe('deleteUserSubscription', () => {
  it('deletes the subscription using the service account token', async () => {
    (serviceAccount.getServiceAccountToken as jest.Mock).mockResolvedValue('sa-token');
    const scope = nock('https://health.googleapis.com')
      .delete('/v4/projects/92059865078/subscribers/biometrics-subscriber/subscriptions/sub-abc-123')
      .reply(200, {});

    await deleteUserSubscription('sub-abc-123');
    expect(scope.isDone()).toBe(true);
  });
});
