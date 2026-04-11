import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { FileListItemProgressBar } from './file-upload-base';

describe('FileListItemProgressBar', () => {
  it('renders processing uploads with distinct warning styling', async () => {
    await render(
      <ul>
        <FileListItemProgressBar
          name="status-test.pdf"
          size={1024}
          progress={100}
          statusIcon="processing"
          statusLabel="Processing"
        />
      </ul>,
    );

    await expect.element(page.getByText('Processing', { exact: true })).toHaveClass(/text-warning-700/);
    expect(document.querySelector('.text-warning-600')).not.toBeNull();
    expect(document.querySelector('.bg-warning-500')).not.toBeNull();
  });
});
