import { getRequestStatus } from './utils';
import { APIKeyRequest } from './types';

const makeRequest = (conditions?: { type: string; status: string }[]): APIKeyRequest =>
  ({
    metadata: { name: 'test', namespace: 'default' },
    ...(conditions !== undefined && { status: { conditions } }),
  } as APIKeyRequest);

describe('getRequestStatus', () => {
  it('returns Pending when status is undefined', () => {
    expect(getRequestStatus(makeRequest())).toBe('Pending');
  });

  it('returns Pending when conditions is undefined', () => {
    const request = makeRequest();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request.status = {} as any;
    expect(getRequestStatus(request)).toBe('Pending');
  });

  it('returns Pending when conditions is empty', () => {
    expect(getRequestStatus(makeRequest([]))).toBe('Pending');
  });

  it('returns Approved when Approved condition is True', () => {
    expect(getRequestStatus(makeRequest([{ type: 'Approved', status: 'True' }]))).toBe('Approved');
  });

  it('returns Denied when Denied condition is True', () => {
    expect(getRequestStatus(makeRequest([{ type: 'Denied', status: 'True' }]))).toBe('Denied');
  });

  it('returns Pending when conditions exist but none are True', () => {
    expect(
      getRequestStatus(
        makeRequest([
          { type: 'Approved', status: 'False' },
          { type: 'Denied', status: 'False' },
        ]),
      ),
    ).toBe('Pending');
  });

  it('returns Approved over Denied when both are True', () => {
    expect(
      getRequestStatus(
        makeRequest([
          { type: 'Denied', status: 'True' },
          { type: 'Approved', status: 'True' },
        ]),
      ),
    ).toBe('Approved');
  });

  it('ignores conditions with unrecognised types', () => {
    expect(getRequestStatus(makeRequest([{ type: 'Ready', status: 'True' }]))).toBe('Pending');
  });
});
