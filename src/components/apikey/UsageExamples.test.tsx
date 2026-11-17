import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { APIKey } from '../../utils/resources';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import UsageExamples from './UsageExamples';

const approvedKey = (status: NonNullable<APIKey['status']> = {}): APIKey => ({
  apiVersion: 'devportal.kuadrant.io/v1alpha1',
  kind: 'APIKey',
  metadata: { name: 'my-key', namespace: 'consumer' },
  spec: { apiProductRef: { name: 'my-product' } },
  status: {
    conditions: [{ type: 'Approved', status: 'True' }],
    apiHostname: 'api.example.com',
    ...status,
  },
});

describe('UsageExamples', () => {
  it('renders nothing for a key that is not approved', () => {
    const pending: APIKey = {
      ...approvedKey(),
      status: { conditions: [{ type: 'Approved', status: 'False' }] },
    };
    const { container } = render(<UsageExamples apiKey={pending} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to Bearer when the status carries no auth scheme', () => {
    render(<UsageExamples apiKey={approvedKey()} />);
    expect(screen.getByText('Usage Examples')).toBeInTheDocument();
    expect(document.getElementById('code-curl')).toHaveTextContent(
      'Authorization: Bearer YOUR_API_KEY',
    );
  });

  it('uses the Authorization prefix from the APIKey status', () => {
    render(
      <UsageExamples
        apiKey={approvedKey({
          authScheme: { credentials: { authorizationHeader: { prefix: 'APIKEY' } } },
        })}
      />,
    );
    const curl = document.getElementById('code-curl');
    expect(curl).toHaveTextContent('Authorization: APIKEY YOUR_API_KEY');
    expect(curl).not.toHaveTextContent('Bearer');
  });

  it('uses a custom header from the APIKey status', () => {
    render(
      <UsageExamples
        apiKey={approvedKey({
          authScheme: { credentials: { customHeader: { name: 'X-API-Key' } } },
        })}
      />,
    );
    const curl = document.getElementById('code-curl');
    expect(curl).toHaveTextContent('X-API-Key: YOUR_API_KEY');
    expect(curl).not.toHaveTextContent('Authorization');
  });
});
