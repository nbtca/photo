import {
  htmlHasBrParagraphBreaks,
  htmlToPlainText,
  safelyParseFormattedHtml,
} from '@/utility/html';

describe('HTML', () => {
  it('safely parses', () => {
    expect(safelyParseFormattedHtml('<p>TEXT</p>')).toBe('TEXT');
    expect(safelyParseFormattedHtml('<b>TEXT</b>')).toBe('<b>TEXT</b>');
    expect(safelyParseFormattedHtml('Line 1\nLine 2'))
      .toBe('Line 1<br />Line 2');
    expect(safelyParseFormattedHtml('Line 1\r\n\r\nLine 2'))
      .toBe('Line 1<br /><br />Line 2');
    expect(safelyParseFormattedHtml('<b>Bold</b>\ntext'))
      .toBe('<b>Bold</b><br />text');
  });
  it('removes unsafe markup', () => {
    expect(safelyParseFormattedHtml('a<script>alert(1)</script>b'))
      .toBe('ab');
    expect(safelyParseFormattedHtml('<b onclick="x()">B</b>'))
      .toBe('<b>B</b>');
    expect(safelyParseFormattedHtml('<img src=x onerror="x()">'))
      .toBe('');
    expect(safelyParseFormattedHtml('<a href="javascript:x()">L</a>'))
      .toBe('<a target="_blank">L</a>');
    expect(safelyParseFormattedHtml('<a href="https://a.b/?q=&quot;">L</a>'))
      .toBe('<a href="https://a.b/?q=&quot;" target="_blank">L</a>');
    expect(safelyParseFormattedHtml('1 &lt; 2 &amp; 3'))
      .toBe('1 &lt; 2 &amp; 3');
  });
  it('converts html to plain text', () => {
    expect(htmlToPlainText('<b>Bold</b> and <i>italic</i>'))
      .toBe('Bold and italic');
    expect(htmlToPlainText('Line 1<br>Line 2')).toBe('Line 1 Line 2');
  });
  it('detects br-style paragraph breaks', () => {
    expect(htmlHasBrParagraphBreaks('TEXT<br><br>')).toBeTruthy();
    expect(htmlHasBrParagraphBreaks('TEXT<br /><br />')).toBeTruthy();
    expect(htmlHasBrParagraphBreaks('TEXT<br><br />')).toBeTruthy();
    expect(htmlHasBrParagraphBreaks('TEXT')).toBeFalsy();
    expect(htmlHasBrParagraphBreaks('TEXT<br/>')).toBeFalsy();
    expect(htmlHasBrParagraphBreaks('TEXT<br />')).toBeFalsy();
  });
});
