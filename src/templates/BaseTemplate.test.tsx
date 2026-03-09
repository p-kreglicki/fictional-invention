import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { TestProviders } from '@/test/TestProviders';
import { BaseTemplate } from './BaseTemplate';

describe('Base template', () => {
  describe('Render method', () => {
    it('should have 3 menu items', async () => {
      await render(
        <TestProviders>
          <BaseTemplate
            leftNav={(
              <>
                <li>link 1</li>
                <li>link 2</li>
                <li>link 3</li>
              </>
            )}
          >
            {null}
          </BaseTemplate>
        </TestProviders>,
      );

      const menuItemList = page.getByRole('listitem');

      expect(menuItemList.elements()).toHaveLength(3);
    });

    it('should have a link to support nextjs-boilerplate.com', async () => {
      await render(
        <TestProviders>
          <BaseTemplate leftNav={<li>1</li>}>{null}</BaseTemplate>
        </TestProviders>,
      );

      const copyrightSection = page.getByText(/© /);
      const copyrightLink = copyrightSection.getByRole('link');

      /*
       * PLEASE READ THIS SECTION
       * We'll really appreciate if you could have a link to our website
       * The link doesn't need to appear on every pages, one link on one page is enough.
       * Thank you for your support it'll mean a lot for us.
       */
      expect(copyrightLink).toHaveAttribute(
        'href',
        'https://nextjs-boilerplate.com',
      );
    });
  });
});
