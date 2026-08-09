/*
 * wechat-markdown-editor canonical WeChat renderer
 * Copyright (C) 2026 wechat-markdown-editor contributors
 *
 * Includes behavior adapted from gzh-design-skill
 * Copyright (C) 2026 甲木 (Jiamu) × 摸鱼小李 (Moyu Xiaoli)
 * Licensed under AGPL-3.0-or-later. See LICENSE and THIRD_PARTY_NOTICES.md.
 */
(function (global) {
  'use strict';

  var marked = global.marked;
  var GzhThemes = global.GzhThemes;

  if (!marked || !GzhThemes) {
    throw new Error('GzhRenderer requires marked and GzhThemes');
  }

  var CJK_RE = /[\u3400-\u9fff]/;
  var FORBIDDEN = [
    { rx: /<style[\s>]/gi, message: '<style> 标签会被过滤，样式必须内联' },
    { rx: /<script[\s>]/gi, message: '<script> 标签会被过滤' },
    { rx: /<\/?div[\s>]/gi, message: '<div> 会被改写，请用 <section>' },
    { rx: /<link[\s>]/gi, message: '外部 <link>（CSS/字体）会被过滤' },
    { rx: /\sclass\s*=/gi, message: 'class 属性会被剥离，请用内联 style' },
    { rx: /\sid\s*=/gi, message: 'id 属性会被剥离' },
    { rx: /position\s*:\s*(fixed|absolute|sticky)/gi, message: 'position fixed/absolute/sticky 不被支持' },
    { rx: /float\s*:/gi, message: 'float 不被支持' },
    { rx: /@media/gi, message: '@media 媒体查询不被支持' },
    { rx: /@keyframes/gi, message: '@keyframes 动画不被支持' },
    { rx: /@import/gi, message: '@import 不被支持' },
    { rx: /display\s*:\s*grid/gi, message: 'display:grid 不被支持，请用 flex' },
    { rx: /var\s*\(\s*--/gi, message: 'CSS 变量 var(--x) 不被支持，请写死值' },
    { rx: /url\s*\(\s*['"]?https?:\/\/[^)]*\.(?:woff2?|ttf|otf|eot)/gi, message: '外部字体不被支持' }
  ];

  function isOriginalClassic(theme) {
    return Boolean(theme && theme.skeletonFamily === 'original-classic');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function normalizeChineseText(value) {
    var text = String(value == null ? '' : value);
    if (!CJK_RE.test(text)) return text;
    var urls = [];
    text = text.replace(/https?:\/\/[A-Za-z0-9][A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]*/g, function (url) {
      urls.push(url);
      return '\u0000URL' + (urls.length - 1) + '\u0000';
    });
    text = text
      .replace(/([\u3400-\u9fff])\s*,\s*/g, '$1，')
      .replace(/([\u3400-\u9fff])\s*;\s*/g, '$1；')
      .replace(/([\u3400-\u9fff])\s*:\s*/g, '$1：')
      .replace(/([\u3400-\u9fff])\s*!\s*/g, '$1！')
      .replace(/([\u3400-\u9fff])\s*\?\s*/g, '$1？')
      .replace(/([\u3400-\u9fff])\s*\.\s*(?=$|[\u3400-\u9fff])/g, '$1。');
    var doubleOpen = true;
    var singleOpen = true;
    text = text.replace(/["']/g, function (quote) {
      if (quote === '"') {
        doubleOpen = !doubleOpen;
        return doubleOpen ? '”' : '“';
      }
      singleOpen = !singleOpen;
      return singleOpen ? '’' : '‘';
    });
    return text.replace(/\u0000URL(\d+)\u0000/g, function (_, index) {
      return urls[Number(index)] || '';
    });
  }

  function leaf(text, preservePunctuation) {
    if (text == null || text === '') return '<span leaf=""><br></span>';
    if (preservePunctuation) return '<span leaf="">' + escapeHtml(String(text)) + '</span>';
    var parts = String(text).split(/(https?:\/\/[A-Za-z0-9][A-Za-z0-9._~:/?#[\]@!$&()*+,%=-]*[A-Za-z0-9\/#=_~-]|[A-Za-z][A-Za-z0-9]*(?:'[A-Za-z]+)+)/g);
    return parts.filter(function (part) { return part !== ''; }).map(function (part) {
      return '<span leaf="">' + escapeHtml(normalizeChineseText(part)) + '</span>';
    }).join('');
  }

  function rawHtmlLeaf(text) {
    var marker = '\u0000GZH_EQ\u0000';
    return leaf(String(text || '').replace(/=/g, marker)).split(marker).join('&#61;');
  }

  function lineBreakLeaf(text, theme) {
    var lines = String(text || '').split('\n');
    return lines.map(function (line) {
      return line ? (theme ? renderInlineRuns(line, theme) : leaf(line)) : '<span leaf=""><br></span>';
    }).join('<br>');
  }

  function sanitizeUrl(url, allowDataImage) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    var lower = raw.toLowerCase();
    if (lower.indexOf('javascript:') === 0 || lower.indexOf('vbscript:') === 0) return '';
    if (lower.indexOf('data:') === 0) {
      if (allowDataImage && /^data:image\//i.test(raw)) return raw;
      return '';
    }
    return raw;
  }

  function normalizeMarkdown(source) {
    var lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    var fenceChar = '';
    var fenceLength = 0;
    return lines.map(function (line) {
      var marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        var char = marker[1].charAt(0);
        if (!fenceChar) {
          fenceChar = char;
          fenceLength = marker[1].length;
        } else if (char === fenceChar && marker[1].length >= fenceLength && /^\s*(?:`+|~+)\s*$/.test(line)) {
          fenceChar = '';
          fenceLength = 0;
        }
        return line;
      }
      if (fenceChar) return line;
      return line.replace(/<u>([\s\S]*?)<\/u>/gi, '++$1++');
    }).join('\n');
  }

  function splitLine(line) {
    return String(line || '').split('|').map(function (part) {
      return part.trim();
    });
  }

  function parseNonEmptyLines(content) {
    return String(content || '').split('\n').map(function (line) {
      return line.trim();
    }).filter(Boolean);
  }

  function looksLikeImageRef(value) {
    var text = String(value || '').trim();
    return /^(img-|https?:\/\/|data:image\/|\.{0,2}\/|\/)/i.test(text);
  }

  function resolveImageSource(ref, options) {
    var source = ref;
    if (options && typeof options.resolveImage === 'function') {
      source = options.resolveImage(ref);
    }
    return sanitizeUrl(source || ref, true);
  }

  function parseHero(content) {
    var lines = parseNonEmptyLines(content);
    if (!lines.length) {
      return {
        breaking: 'BREAKING',
        date: '',
        subtitle: '',
        titlePrimary: '',
        titleAccent: '',
        description: '',
        barText: '',
        tags: [],
        imageRef: ''
      };
    }
    var meta = splitLine(lines[0]);
    var result = {
      breaking: meta[0] || 'BREAKING',
      date: meta[1] || '',
      subtitle: '',
      titlePrimary: '',
      titleAccent: '',
      description: '',
      barText: '',
      tags: [],
      imageRef: ''
    };
    if (lines.length >= 6) {
      var legacyTitle = splitLine(lines[2]);
      var legacyBar = splitLine(lines[4]);
      result.subtitle = lines[1] || '';
      result.titlePrimary = legacyTitle[0] || '';
      result.titleAccent = legacyTitle[1] || '';
      result.description = lines[3] || '';
      result.barText = legacyBar[0] || '';
      result.tags = legacyBar[1] ? legacyBar[1].split(',').map(function (tag) { return tag.trim(); }).filter(Boolean) : [];
      result.imageRef = lines[5] || '';
      return result;
    }
    if (lines.length === 3) {
      var compactLegacyTitle = splitLine(lines[2]);
      result.subtitle = lines[1] || '';
      result.titlePrimary = compactLegacyTitle[0] || '';
      result.titleAccent = compactLegacyTitle[1] || '';
      result.tags = compactLegacyTitle.slice(1).filter(Boolean);
      return result;
    }
    var likelyNew = lines[1] && lines[1].indexOf('|') >= 0 && lines[3] && lines[3].indexOf('|') >= 0;
    if (lines.length === 5 && !looksLikeImageRef(lines[4]) && !likelyNew) {
      var legacyNoImage = splitLine(lines[2]);
      var legacyBarNoImage = splitLine(lines[4]);
      result.subtitle = lines[1] || '';
      result.titlePrimary = legacyNoImage[0] || '';
      result.titleAccent = legacyNoImage[1] || '';
      result.description = lines[3] || '';
      result.barText = legacyBarNoImage[0] || '';
      result.tags = legacyBarNoImage[1] ? legacyBarNoImage[1].split(',').map(function (tag) { return tag.trim(); }).filter(Boolean) : [];
      return result;
    }
    var title = splitLine(lines[1] || '');
    var bar = splitLine(lines[3] || '');
    result.titlePrimary = title[0] || '';
    result.titleAccent = title[1] || title[2] || '';
    result.description = lines[2] || '';
    result.barText = bar[0] || '';
    result.tags = bar[1] ? bar[1].split(',').map(function (tag) { return tag.trim(); }).filter(Boolean) : [];
    result.imageRef = looksLikeImageRef(lines[4]) ? lines[4] : '';
    return result;
  }

  function plainMarkdownText(value) {
    return String(value || '')
      .replace(/\+\+|==/g, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim();
  }

  function protectCodeFences(source) {
    var lines = String(source || '').split('\n');
    var output = [];
    var fences = {};
    var block = [];
    var fenceChar = '';
    var fenceLength = 0;
    var counter = 0;
    lines.forEach(function (line) {
      var opening = line.match(/^\s*(`{3,}|~{3,})/);
      if (!fenceChar && opening) {
        fenceChar = opening[1].charAt(0);
        fenceLength = opening[1].length;
        block = [line];
        return;
      }
      if (fenceChar) {
        block.push(line);
        var closing = line.match(/^\s*(`{3,}|~{3,})\s*$/);
        if (closing && closing[1].charAt(0) === fenceChar && closing[1].length >= fenceLength) {
          counter += 1;
          var token = '<!--GZH_FENCE_' + counter + '-->';
          fences[token] = block.join('\n');
          output.push(token);
          block = [];
          fenceChar = '';
          fenceLength = 0;
        }
        return;
      }
      output.push(line);
    });
    if (block.length) {
      counter += 1;
      var token = '<!--GZH_FENCE_' + counter + '-->';
      fences[token] = block.join('\n');
      output.push(token);
    }
    return { source: output.join('\n'), fences: fences };
  }

  function isEndingTitle(title) {
    return /(?:写在最后|写到最后|结语|结论|后记|尾声|终章|总结)/.test(String(title || ''));
  }

  function collectStructure(markdown, ctx) {
    var titleMatch = String(markdown || '').match(/^#\s+(.+)$/m);
    if (titleMatch) ctx.title = plainMarkdownText(titleMatch[1]);
    if (!ctx.title) {
      var heroMatch = String(markdown || '').match(/\[HERO\]([\s\S]*?)\[\/HERO\]/);
      if (heroMatch) {
        var hero = parseHero(heroMatch[1]);
        ctx.title = [hero.titlePrimary, hero.titleAccent].filter(Boolean).join(' ');
      }
    }

    var entries = [];
    var pattern = /^##\s+(.+)$|\[CHAPTER\]([\s\S]*?)\[\/CHAPTER\]/gm;
    var match;
    while ((match = pattern.exec(markdown))) {
      if (match[1]) {
        entries.push({ kind: 'standard', title: plainMarkdownText(match[1]) });
      } else {
        var lines = parseNonEmptyLines(match[2]);
        var parts = splitLine(lines[0] || '');
        entries.push({ kind: 'legacy', title: plainMarkdownText(parts[2] || parts[1] || parts[0]) });
      }
    }
    entries.forEach(function (entry, index) {
      entry.index = index + 1;
      entry.isEnding = isEndingTitle(entry.title);
      ctx.chapters.push(entry.title || ('章节 ' + (index + 1)));
      if (entry.kind === 'standard') ctx.standardChapterQueue.push(entry);
      else ctx.legacyChapterQueue.push(entry);
    });
  }

  function renderInlineRuns(text, theme, state) {
    var source = String(text || '');
    if (!source) return '';
    var regex = /(\+\+[\s\S]+?\+\+|==[\s\S]+?==|\*\*[\s\S]+?\*\*|=([A-Za-z])=([\s\S]+?)=\/\2=)/g;
    var underlineColors = { g: '#059669', r: '#DC2626', b: '#2563EB', o: '#EA580C', p: '#7C3AED', k: '#DB2777', y: '#FDE68A' };
    var highlightColors = { G: 'rgba(5,150,105,0.25)', R: 'rgba(220,38,38,0.25)', B: 'rgba(37,99,235,0.25)', O: 'rgba(234,88,12,0.25)', P: 'rgba(124,58,237,0.25)', K: 'rgba(219,39,119,0.25)', Y: '#FDE68A' };
    var html = '';
    var lastIndex = 0;
    var match;
    var previousWasCjk = Boolean(state && state.previousWasCjk);
    function renderPlain(value) {
      if (previousWasCjk) {
        value = value.replace(/^\s*([,;:!?])/, function (_, punctuation) {
          return { ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' }[punctuation];
        });
      }
      if (CJK_RE.test(value)) previousWasCjk = true;
      else if (value.trim()) previousWasCjk = false;
      return leaf(value);
    }
    while ((match = regex.exec(source))) {
      if (match.index > lastIndex) {
        html += renderPlain(source.slice(lastIndex, match.index));
      }
      var token = match[0];
      var legacyMark = match[2] || '';
      var inner = legacyMark ? match[3] : token.slice(2, -2);
      if (legacyMark) {
        if (legacyMark === legacyMark.toUpperCase()) {
          var highlight = isOriginalClassic(theme) ? (legacyMark === 'Y' ? theme.colors.accent : (highlightColors[legacyMark] || theme.colors.primaryLight)) : theme.colors.primaryLight;
          html += '<span style="color:' + theme.colors.title + ';font-weight:700;background:' + highlight + ';padding:2px 4px;border-radius:2px;">' + leaf(inner) + '</span>';
        } else {
          var underline = isOriginalClassic(theme) ? (underlineColors[legacyMark] || theme.colors.primary) : theme.colors.underline;
          html += '<span style="color:' + theme.colors.title + ';font-weight:700;border-bottom:2px solid ' + underline + ';padding-bottom:1px;">' + leaf(inner) + '</span>';
        }
      } else if (token.slice(0, 2) === '++') {
        html += '<span style="' + theme.underlineCss + 'color:' + theme.colors.title + ';">' + leaf(inner) + '</span>';
      } else if (token.slice(0, 2) === '==') {
        html += '<span style="background:' + theme.colors.primaryLight + ';color:' + theme.colors.title + ';padding:2px 5px;border-radius:3px;font-weight:700;">' + leaf(inner) + '</span>';
      } else {
        html += '<strong style="font-weight:800;color:' + theme.colors.title + ';">' + leaf(inner) + '</strong>';
      }
      previousWasCjk = CJK_RE.test(inner);
      lastIndex = match.index + token.length;
    }
    if (lastIndex < source.length) {
      html += renderPlain(source.slice(lastIndex));
    }
    if (state) state.previousWasCjk = previousWasCjk;
    return html;
  }

  function paragraphStyle(theme) {
    if (isOriginalClassic(theme)) {
      return 'margin:14px 0;font-family:' + theme.fontFamily + ';font-size:14px;line-height:1.85;color:' + theme.colors.body + ';letter-spacing:0.5px;';
    }
    switch (theme.id) {
      case 'red-white':
        return 'margin:18px 0;font-family:' + theme.fontFamily + ';font-size:15px;line-height:1.85;color:#374151;letter-spacing:0.15px;';
      case 'graphite-minimal':
        return 'margin:20px 0;font-family:' + theme.fontFamily + ';font-size:15px;line-height:1.85;color:#52525B;letter-spacing:0.3px;';
      case 'zen-whitespace':
        return "margin:24px 0;font-family:'Songti SC','Noto Serif CJK SC',serif;font-size:15px;line-height:2;color:#525252;letter-spacing:0.5px;";
      case 'moyu-ticket':
        return 'margin:14px 0;font-family:' + theme.fontFamily + ';font-size:14px;line-height:1.9;color:#555555;letter-spacing:0.15px;';
      case 'olive-journal':
        return 'margin:16px 0;font-family:' + theme.fontFamily + ';font-size:14px;line-height:1.9;color:#4D4F46;letter-spacing:0.25px;';
      default:
        return 'margin:14px 0;font-family:' + theme.fontFamily + ';font-size:14px;line-height:1.9;color:#374151;letter-spacing:0.2px;';
    }
  }

  function renderChapterHeading(titleHtml, titleText, entry, theme, label, subtitle) {
    var index = entry && entry.index ? entry.index : 1;
    var ending = Boolean(entry && entry.isEnding);
    var number = String(index).padStart(2, '0');
    label = label || 'CHAPTER';
    subtitle = subtitle || '';
    if (isOriginalClassic(theme)) {
      number = entry && entry.displayNumber ? entry.displayNumber : number;
      var safeNumber = String(number).split('').join('\u200D');
      return '<section style="padding:20px 0;margin:28px 0 16px;border-bottom:1px solid ' + theme.colors.border + ';">'
        + '<section style="display:flex;align-items:stretch;gap:16px;">'
        + '<section style="flex:0 0 55px;text-align:left;"><p style="margin:0;font-size:36px;font-weight:900;color:' + theme.colors.primary + ';line-height:1;white-space:nowrap;">' + leaf(safeNumber, true) + '</p><p style="margin:4px 0 0;font-size:10px;font-weight:700;color:' + theme.colors.muted + ';letter-spacing:1px;">' + leaf(label, true) + '</p></section>'
        + '<section style="width:2px;background:' + theme.colors.primary + ';font-size:0;line-height:0;"><span leaf=""><br></span></section>'
        + '<section style="flex:1 1 auto;padding-left:0;text-align:left;"><h2 style="margin:0 0 4px;font-size:16px;font-weight:900;color:' + theme.colors.title + ';line-height:1.3;">' + titleHtml + '</h2>'
        + (subtitle ? '<p style="margin:0;font-size:11px;color:' + theme.colors.muted + ';letter-spacing:0.5px;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section></section></section>';
    }
    if (theme.id === 'moyu-green') {
      number = ending ? '///' : number;
      label = ending ? 'LAST' : (label || 'PART');
      return '<section style="margin:' + (index === 1 ? '16px' : '48px') + ' 0 18px;padding:0 0 12px;border-bottom:1px solid #E5E7EB;">'
        + '<section style="display:flex;gap:14px;align-items:flex-end;">'
        + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:30px;font-weight:900;line-height:1;color:#059669;">' + leaf(number, true) + '</p>'
        + '<section style="flex:1 1 auto;"><p style="margin:0 0 3px;font-family:' + theme.fontFamily + ';font-size:10px;font-weight:800;letter-spacing:1.4px;color:#9CA3AF;">' + leaf(label) + '</p>'
        + '<h2 style="margin:0;font-family:' + theme.fontFamily + ';font-size:19px;font-weight:900;line-height:1.35;color:#111827;">' + titleHtml + '</h2></section></section>'
        + (subtitle ? '<p style="margin:8px 0 0 58px;font-size:12px;color:#9CA3AF;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section>';
    }
    if (theme.id === 'red-white') {
      number = ending ? '∞' : number;
      label = ending ? 'THE END' : label;
      return '<section style="margin:' + (index === 1 ? '16px' : '48px') + ' 0 18px;padding-top:14px;border-top:1px solid #FECACA;">'
        + '<section style="display:flex;gap:14px;align-items:center;"><span style="display:inline-block;min-width:42px;padding:7px 6px;background:#DC2626;color:#FFFFFF;text-align:center;font-family:' + theme.fontFamily + ';font-size:16px;font-weight:900;">' + leaf(number, true) + '</span>'
        + '<section style="flex:1 1 auto;"><p style="margin:0 0 2px;font-size:10px;font-weight:800;letter-spacing:1.4px;color:#DC2626;">' + leaf(label, true) + '</p><h2 style="margin:0;font-family:' + theme.fontFamily + ';font-size:20px;font-weight:900;line-height:1.35;color:#1C1917;">' + titleHtml + '</h2></section></section>'
        + (subtitle ? '<p style="margin:8px 0 0 56px;font-size:12px;color:#9CA3AF;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section>';
    }
    if (theme.id === 'graphite-minimal') {
      number = ending ? '∞' : number;
      label = ending ? 'THE END' : label;
      return '<section style="margin:' + (index === 1 ? '16px' : '56px') + ' 0 20px;padding:12px 0 14px;border-top:1px solid #E4E4E7;border-bottom:1px solid #E4E4E7;">'
        + '<section style="display:flex;gap:18px;align-items:center;"><p style="margin:0;min-width:64px;font-family:Georgia,serif;font-size:48px;font-weight:300;line-height:1;color:#D4D4D8;">' + leaf(number, true) + '</p>'
        + '<section style="flex:1 1 auto;"><p style="margin:0 0 5px;font-size:10px;font-weight:600;letter-spacing:2px;color:#A1A1AA;">' + leaf(label, true) + '</p><h2 style="margin:0;font-family:' + theme.fontFamily + ';font-size:20px;font-weight:700;line-height:1.4;color:#27272A;">' + titleHtml + '</h2></section></section>'
        + (subtitle ? '<p style="margin:8px 0 0 82px;font-size:12px;color:#A1A1AA;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section>';
    }
    if (theme.id === 'zen-whitespace') {
      number = ending ? '∞' : number;
      label = ending ? 'POSTSCRIPT' : label;
      return '<section style="margin:' + (index === 1 ? '32px' : '64px') + ' 0 24px;text-align:center;">'
        + '<p style="margin:0 0 12px;font-family:' + theme.fontFamily + ';font-size:10px;font-weight:600;letter-spacing:2.2px;color:#4A5D52;">' + leaf(number + ' · ' + label, true) + '</p>'
        + '<h2 style="margin:0;font-family:\'Songti SC\',\'Noto Serif CJK SC\',serif;font-size:23px;font-weight:600;line-height:1.5;color:#2B2B2B;">' + titleHtml + '</h2>'
        + '<section style="width:36px;height:1px;margin:16px auto 0;background:#B5C8BC;font-size:0;line-height:0;"><span leaf=""><br></span></section>'
        + (subtitle ? '<p style="margin:12px 0 0;font-size:12px;color:#A3A3A3;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section>';
    }
    if (theme.id === 'moyu-ticket') {
      return '<section style="margin:32px 4px 18px;padding:14px 16px;border:2px solid #1A1A1A;border-left:8px solid #059669;background:#FFFEF8;box-shadow:4px 4px 0 #1A1A1A;">'
        + '<section style="display:flex;gap:14px;align-items:center;"><p style="margin:0;min-width:42px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:900;color:#059669;">' + leaf(number, true) + '</p>'
        + '<section style="flex:1 1 auto;"><p style="margin:0 0 3px;font-size:10px;font-weight:800;letter-spacing:1.6px;color:#888888;">' + leaf(label, true) + '</p><h2 style="margin:0;font-family:' + theme.fontFamily + ';font-size:18px;font-weight:900;line-height:1.35;color:#1A1A1A;">' + titleHtml + '</h2></section></section>'
        + (subtitle ? '<p style="margin:8px 0 0 56px;font-size:12px;color:#888888;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section>';
    }
    return '<section style="margin:38px 0 18px;padding:0 0 10px;border-bottom:2px solid #23251D;">'
      + '<p style="margin:0 0 7px;font-family:' + theme.fontFamily + ';font-size:10px;font-weight:800;letter-spacing:1.8px;color:#ED7B2F;">' + leaf('FIELD NOTE ' + number, true) + '</p>'
      + '<h2 style="margin:0;font-family:' + theme.fontFamily + ';font-size:21px;font-weight:800;line-height:1.35;color:#23251D;">' + titleHtml + '</h2>'
      + (subtitle ? '<p style="margin:7px 0 0;font-size:12px;color:#65675E;">' + renderInlineRuns(subtitle, theme) + '</p>' : '') + '</section>';
  }

  function renderSubheading(body, theme) {
    if (isOriginalClassic(theme)) return '<h3 style="font-size:15px;font-weight:700;color:' + theme.colors.body + ';margin:20px 0 10px;line-height:1.5;">' + body + '</h3>';
    if (theme.id === 'moyu-green') return '<h3 style="margin:24px 0 10px;padding-left:10px;border-left:4px solid #059669;font-family:' + theme.fontFamily + ';font-size:16px;font-weight:900;line-height:1.45;color:#111827;">' + body + '</h3>';
    if (theme.id === 'red-white') return '<h3 style="margin:26px 0 10px;padding-left:11px;border-left:3px solid #DC2626;font-family:' + theme.fontFamily + ';font-size:16px;font-weight:800;line-height:1.45;color:#1C1917;">' + body + '</h3>';
    if (theme.id === 'graphite-minimal') return '<h3 style="margin:28px 0 10px;padding-left:12px;border-left:3px solid #52525B;font-family:' + theme.fontFamily + ';font-size:15px;font-weight:700;line-height:1.5;color:#27272A;">' + body + '</h3>';
    if (theme.id === 'zen-whitespace') return '<h3 style="margin:34px 0 12px;text-align:center;font-family:\'Songti SC\',\'Noto Serif CJK SC\',serif;font-size:17px;font-weight:600;line-height:1.6;color:#3D5046;">' + body + '</h3>';
    if (theme.id === 'moyu-ticket') return '<h3 style="margin:24px 0 10px;padding:7px 10px;border-bottom:2px dashed #A7F3D0;font-family:' + theme.fontFamily + ';font-size:15px;font-weight:900;line-height:1.45;color:#1A1A1A;">' + body + '</h3>';
    return '<h3 style="margin:26px 0 10px;padding-left:10px;border-left:3px solid #ED7B2F;font-family:' + theme.fontFamily + ';font-size:15px;font-weight:800;line-height:1.5;color:#23251D;">' + body + '</h3>';
  }

  function quoteStyle(theme, first) {
    if (isOriginalClassic(theme)) return 'margin:18px 0;padding:16px 20px;border-left:3px solid ' + theme.colors.primary + ';background:#F9FAFB;border-radius:0 10px 10px 0;';
    if (theme.id === 'moyu-green') return 'margin:20px 0;padding:15px 17px;border:1px dashed #A7F3D0;background:#F9FAFB;border-radius:12px;';
    if (theme.id === 'red-white') return 'margin:' + (first ? '0 0 28px' : '22px 0') + ';padding:18px 20px;border-left:4px solid #DC2626;background:#FEF2F2;';
    if (theme.id === 'graphite-minimal') return 'margin:' + (first ? '0 0 32px' : '24px 0') + ';padding:20px 8px;border-top:1px solid #52525B;border-bottom:1px solid #E4E4E7;background:#FFFFFF;';
    if (theme.id === 'zen-whitespace') return "margin:" + (first ? '16px 0 42px' : '34px 0') + ";padding:26px 18px;border-top:1px solid #B5C8BC;border-bottom:1px solid #B5C8BC;text-align:center;font-family:'Songti SC','Noto Serif CJK SC',serif;";
    if (theme.id === 'moyu-ticket') return 'margin:22px 4px;padding:15px 17px;border:2px solid #1A1A1A;background:#FFFEF8;box-shadow:4px 4px 0 #A7F3D0;';
    return 'margin:22px 0;padding:16px 18px;border-left:4px solid #ED7B2F;background:#EEEFE9;';
  }

  function listStyles(theme) {
    if (isOriginalClassic(theme)) return { outer: 'margin:14px 0;padding-left:20px;color:' + theme.colors.body + ';', item: 'margin:8px 0;line-height:1.75;font-size:14px;color:' + theme.colors.body + ';' };
    if (theme.id === 'moyu-green') return { outer: 'margin:16px 0;padding-left:24px;color:#374151;', item: 'margin:8px 0;padding-left:3px;line-height:1.9;font-size:14px;' };
    if (theme.id === 'red-white') return { outer: 'margin:18px 0;padding:14px 18px 14px 36px;border-left:3px solid #FECACA;background:#FEF2F2;color:#374151;', item: 'margin:9px 0;line-height:1.8;font-size:15px;' };
    if (theme.id === 'graphite-minimal') return { outer: 'margin:20px 0;padding:12px 16px 12px 34px;border-top:1px solid #E4E4E7;border-bottom:1px solid #E4E4E7;color:#52525B;', item: 'margin:10px 0;line-height:1.8;font-size:15px;' };
    if (theme.id === 'zen-whitespace') return { outer: "margin:28px 0;padding-left:28px;font-family:'Songti SC','Noto Serif CJK SC',serif;color:#525252;", item: 'margin:12px 0;line-height:2;font-size:15px;' };
    if (theme.id === 'moyu-ticket') return { outer: 'margin:18px 4px;padding:13px 16px 13px 34px;border:1px dashed #059669;background:#FFFEF8;color:#555555;', item: 'margin:8px 0;line-height:1.85;font-size:14px;' };
    return { outer: 'margin:18px 0;padding:14px 18px 14px 34px;border:1px solid #BFC1B7;background:#FDFDF8;color:#4D4F46;', item: 'margin:8px 0;line-height:1.9;font-size:14px;' };
  }

  function imageStyles(theme) {
    if (isOriginalClassic(theme)) return { outer: 'margin:18px 0;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:18px auto;border:0 none;border-radius:12px;', caption: 'margin:8px 0 0;font-size:12px;line-height:1.6;color:' + theme.colors.muted + ';text-align:center;' };
    if (theme.id === 'moyu-green') return { outer: 'margin:22px 0;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:14px;', caption: 'margin:8px 0 0;font-size:12px;line-height:1.6;color:#9CA3AF;text-align:center;' };
    if (theme.id === 'red-white') return { outer: 'margin:26px 0;padding-top:6px;border-top:3px solid #DC2626;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:2px;', caption: 'margin:9px 0 0;font-size:12px;line-height:1.6;color:#9CA3AF;text-align:right;' };
    if (theme.id === 'graphite-minimal') return { outer: 'margin:30px 0;padding:10px;border:1px solid #E4E4E7;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:0;', caption: 'margin:10px 0 0;font-size:11px;line-height:1.6;color:#A1A1AA;letter-spacing:1px;text-align:left;' };
    if (theme.id === 'zen-whitespace') return { outer: 'margin:38px 0;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:0;', caption: "margin:12px 0 0;font-family:'Songti SC','Noto Serif CJK SC',serif;font-size:12px;line-height:1.8;color:#A3A3A3;text-align:center;" };
    if (theme.id === 'moyu-ticket') return { outer: 'margin:24px 4px;padding:8px;border:2px solid #1A1A1A;background:#FFFEF8;box-shadow:4px 4px 0 #A7F3D0;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:0;', caption: 'margin:9px 0 0;font-size:11px;line-height:1.6;color:#888888;text-align:center;' };
    return { outer: 'margin:24px 0;padding:10px 10px 8px;border:1px solid #BFC1B7;background:#FDFDF8;text-align:center;', image: 'max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:0;', caption: 'margin:8px 0 0;font-size:11px;line-height:1.6;color:#65675E;text-align:left;' };
  }

  function renderMarkdown(source, theme, options, ctx) {
    var renderer = new marked.Renderer();
    var inlineState = { previousWasCjk: false };

    renderer.heading = function (token) {
      inlineState.previousWasCjk = false;
      var text = this.parser.parseInline(token.tokens);
      if (token.depth === 1) {
        if (!isOriginalClassic(theme)) return '';
        return '<h1 style="font-size:22px;font-weight:900;color:' + theme.colors.title + ';margin:20px 0 12px;line-height:1.4;">' + text + '</h1>';
      }
      if (token.depth === 2) {
        if (isOriginalClassic(theme)) {
          ctx.standardChapterQueue.shift();
          return '<h2 style="font-size:17px;font-weight:900;color:' + theme.colors.primary + ';margin:28px 0 16px;line-height:1.4;padding-bottom:8px;border-bottom:2px solid ' + theme.colors.primary + ';">' + text + '</h2>';
        }
        var entry = ctx.standardChapterQueue.shift() || { index: ctx.chapters.length + 1, isEnding: false };
        return renderChapterHeading(text, plainMarkdownText(token.raw), entry, theme, 'CHAPTER', '');
      }
      if (token.depth === 3) return renderSubheading(text, theme);
      return '<h4 style="margin:18px 0 8px;font-family:' + theme.fontFamily + ';font-size:14px;font-weight:700;line-height:1.5;color:' + theme.colors.title + ';">' + text + '</h4>';
    };

    renderer.paragraph = function (token) {
      inlineState.previousWasCjk = false;
      var body = this.parser.parseInline(token.tokens);
      if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'image') return body;
      return '<p style="' + paragraphStyle(theme) + '">' + body + '</p>';
    };

    renderer.text = function (token) {
      return renderInlineRuns(token.text, theme, inlineState);
    };

    renderer.strong = function (token) {
      return '<strong style="font-weight:800;color:' + theme.colors.title + ';">' + this.parser.parseInline(token.tokens) + '</strong>';
    };

    renderer.em = function (token) {
      return '<em style="font-style:italic;color:' + theme.colors.body + ';">' + this.parser.parseInline(token.tokens) + '</em>';
    };

    renderer.del = function (token) {
      return '<span style="text-decoration:line-through;color:' + theme.colors.muted + ';">' + this.parser.parseInline(token.tokens) + '</span>';
    };

    renderer.codespan = function (token) {
      inlineState.previousWasCjk = false;
      return '<code style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:' + theme.colors.surface + ';color:' + theme.colors.primary + ';padding:2px 6px;border-radius:4px;font-size:13px;">' + leaf(token.text, true) + '</code>';
    };

    renderer.br = function () {
      inlineState.previousWasCjk = false;
      return '<br>';
    };

    renderer.link = function (token) {
      var href = sanitizeUrl(token.href, false);
      var body = this.parser.parseInline(token.tokens);
      if (!href) return body;
      return '<a href="' + escapeAttr(href) + '" style="color:' + theme.colors.primary + ';text-decoration:none;border-bottom:1px solid ' + theme.colors.primary + ';">' + body + '</a>';
    };

    renderer.image = function (token) {
      inlineState.previousWasCjk = false;
      var src = resolveImageSource(token.href, options);
      var alt = token.text || '';
      if (!src) return '<p style="' + paragraphStyle(theme) + '">' + leaf('[图片已被拦截：不安全地址]') + '</p>';
      var styles = imageStyles(theme);
      var caption = alt ? '<p style="font-family:' + theme.fontFamily + ';' + styles.caption + '">' + leaf(alt) + '</p>' : '';
      return '<section style="' + styles.outer + '"><span leaf=""><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt) + '" border="0" style="' + styles.image + '"></span>' + caption + '</section>';
    };

    renderer.blockquote = function (token) {
      ctx.quoteCount += 1;
      var body = this.parser.parse(token.tokens);
      if (isOriginalClassic(theme)) {
        body = body.replace(/<p style="[^"]*">/g, '<p style="margin:6px 0;color:#4B5563;font-size:14px;line-height:1.8;font-style:italic;">');
      }
      return '<section style="' + quoteStyle(theme, ctx.quoteCount === 1) + '">' + body + '</section>';
    };

    renderer.list = function (token) {
      var tag = token.ordered ? 'ol' : 'ul';
      var styles = listStyles(theme);
      var items = token.items.map(function (item) {
        inlineState.previousWasCjk = false;
        var body;
        if (item.tokens && item.tokens.length === 1 && item.tokens[0].tokens) {
          body = renderer.parser.parseInline(item.tokens[0].tokens);
        } else {
          body = renderer.parser.parse(item.tokens).replace(/^<p[^>]*>|<\/p>$/g, '');
        }
        return '<li style="font-family:' + theme.fontFamily + ';' + styles.item + '">' + body + '</li>';
      }).join('');
      return '<' + tag + ' style="font-family:' + theme.fontFamily + ';' + styles.outer + '">' + items + '</' + tag + '>';
    };

    renderer.code = function (token) {
      var lines = String(token.text || '').replace(/\r\n?/g, '\n').split('\n');
      var codeLines = lines.map(function (line) {
        return '<p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#F9FAFB;">' + (line ? leaf(line, true) : '<span leaf=""><br></span>') + '</p>';
      }).join('');
      return '<section style="margin:20px 0;padding:14px 16px;border-radius:12px;background:#1F2937;">' + codeLines + '</section>';
    };

    renderer.hr = function () {
      return '<section style="margin:28px 0;height:1px;background:' + theme.colors.border + ';font-size:0;line-height:0;"><span leaf=""><br></span></section>';
    };

    renderer.table = function (token) {
      var header = '<tr>' + token.header.map(function (cell) {
        inlineState.previousWasCjk = false;
        return '<th style="padding:10px 12px;border:1px solid ' + theme.colors.border + ';background:' + theme.colors.surface + ';font-family:' + theme.fontFamily + ';font-size:12px;color:' + theme.colors.title + ';text-align:left;">' + renderer.parser.parseInline(cell.tokens) + '</th>';
      }).join('') + '</tr>';
      var rows = token.rows.map(function (row) {
        return '<tr>' + row.map(function (cell) {
          inlineState.previousWasCjk = false;
          return '<td style="padding:10px 12px;border:1px solid ' + theme.colors.border + ';font-family:' + theme.fontFamily + ';font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';color:' + theme.colors.body + ';">' + renderer.parser.parseInline(cell.tokens) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      return '<section style="margin:18px 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">' + header + rows + '</table></section>';
    };

    renderer.html = function (token) {
      if (/^<!--GZH_[A-Z_0-9]+-->$/.test(token.raw.trim())) {
        return token.raw.trim();
      }
      return rawHtmlLeaf(token.raw);
    };

    return marked.parse(source, { renderer: renderer, gfm: true, breaks: true });
  }

  function renderPartBlock(content, theme, ctx) {
    ctx.hasExplicitToc = true;
    var lines = parseNonEmptyLines(content);
    if (!lines.length) return '';
    var headerLine = lines.shift();
    var hintIndex = headerLine.lastIndexOf('👉');
    var title = hintIndex > 0 ? headerLine.slice(0, hintIndex).trim() : headerLine;
    var hint = hintIndex > 0 ? headerLine.slice(hintIndex + '👉'.length).trim() : '';
    if (isOriginalClassic(theme)) {
      var originalItems = lines.map(function (line) {
        var active = line.charAt(0) === '*';
        var parts = splitLine(active ? line.slice(1) : line);
        var background = active ? theme.colors.primary : '#FAFBFB';
        var border = active ? theme.colors.primary : '#E8E8E8';
        var labelColor = active ? 'rgba(255,255,255,0.85)' : theme.colors.muted;
        var titleColor = active ? '#FFFFFF' : theme.colors.title;
        var summaryColor = active ? 'rgba(255,255,255,0.75)' : theme.colors.muted;
        return '<section style="flex:1 1 0;min-width:0;max-width:none;padding:0 4px;">'
          + '<section style="padding:9px 10px;background:' + background + ';border-radius:10px;text-align:left;border:1px solid ' + border + ';">'
          + '<p style="margin:0 0 4px;font-size:10px;font-weight:600;color:' + labelColor + ';">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
          + '<p style="margin:0 0 2px;font-size:14px;font-weight:700;color:' + titleColor + ';">' + renderInlineRuns(parts[1] || '', theme) + '</p>'
          + '<p style="margin:0;font-size:11px;line-height:1.5;color:' + summaryColor + ';">' + renderInlineRuns(parts[2] || '', theme) + '</p></section></section>';
      }).join('');
      return '<section style="margin-bottom:8px;">'
        + '<section style="display:flex;justify-content:space-between;align-items:center;gap:12px;"><p style="margin:0;font-size:13px;font-weight:600;color:' + theme.colors.body + ';">' + renderInlineRuns(title, theme) + '</p>'
        + '<p style="margin:0;font-size:12px;color:' + theme.colors.muted + ';">' + renderInlineRuns(hint ? '👉 ' + hint : '', theme) + '</p></section>'
        + '<section style="display:flex;flex-direction:row;margin-top:6px;overflow-x:auto;">' + originalItems + '</section></section>';
    }
    var items = lines.map(function (line) {
      var active = line.charAt(0) === '*';
      var parts = splitLine(active ? line.slice(1) : line);
      return '<section style="flex:1 1 0;min-width:120px;padding:12px 14px;border:1px solid ' + (active ? theme.colors.primary : theme.colors.border) + ';border-radius:12px;background:' + (active ? theme.colors.primaryLight : theme.colors.background) + ';">'
        + '<p style="margin:0 0 6px;font-family:' + theme.fontFamily + ';font-size:11px;font-weight:800;color:' + (active ? theme.colors.primary : theme.colors.muted) + ';letter-spacing:0.8px;">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
        + '<p style="margin:0 0 4px;font-family:' + theme.fontFamily + ';font-size:14px;font-weight:800;color:' + theme.colors.title + ';">' + renderInlineRuns(parts[1] || '', theme) + '</p>'
        + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:12px;line-height:1.6;color:' + theme.colors.body + ';">' + renderInlineRuns(parts[2] || '', theme) + '</p>'
        + '</section>';
    }).join('');
    return '<section style="margin:24px 0;padding:16px 18px;border:1px solid ' + theme.colors.border + ';border-radius:16px;background:' + theme.colors.background + ';">'
      + '<section style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:12px;">'
      + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:14px;font-weight:800;color:' + theme.colors.title + ';">' + renderInlineRuns(title, theme) + '</p>'
      + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:11px;color:' + theme.colors.muted + ';">' + renderInlineRuns(hint, theme) + '</p>'
      + '</section>'
      + '<section style="display:flex;gap:10px;flex-wrap:wrap;">' + items + '</section>'
      + '</section>';
  }

  function renderHeroBlock(content, theme, options, ctx) {
    var hero = parseHero(content);
    if (!ctx.title) ctx.title = [hero.titlePrimary, hero.titleAccent].filter(Boolean).join(' ');
    var image = hero.imageRef ? resolveImageSource(hero.imageRef, options) : '';
    var title = renderInlineRuns(hero.titlePrimary || '', theme) + (hero.titleAccent ? '<br><span style="color:' + theme.colors.primary + ';">' + renderInlineRuns(hero.titleAccent, theme) + '</span>' : '');
    var meta = leaf(hero.breaking + (hero.date ? ' · ' + hero.date : ''), true);
    var tags = hero.tags.map(function (tag) {
      return '<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;font-family:' + theme.fontFamily + ';font-size:11px;font-weight:700;">' + renderInlineRuns(tag, theme) + '</span>';
    }).join('');
    var imageHtml = image ? '<section style="flex:0 1 126px;"><span leaf=""><img src="' + escapeAttr(image) + '" alt="" border="0" style="max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;"></span></section>' : '';
    var subtitle = hero.subtitle ? '<p style="margin:0 0 7px;font-size:12px;line-height:1.6;">' + renderInlineRuns(hero.subtitle, theme) + '</p>' : '';
    var description = hero.description ? '<p style="margin:10px 0 0;font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';">' + renderInlineRuns(hero.description, theme) + '</p>' : '';
    var bar = (hero.barText || tags) ? '<section style="margin-top:14px;padding-top:11px;border-top:1px solid ' + theme.colors.border + ';">'
      + (hero.barText ? '<p style="margin:0 0 7px;font-size:12px;font-weight:700;">' + renderInlineRuns(hero.barText, theme) + '</p>' : '') + tags + '</section>' : '';

    if (isOriginalClassic(theme)) {
      var originalTags = hero.tags.map(function (tag) {
        return '<span style="display:inline-block;padding:3px 10px;background:rgba(255,255,255,0.3);border-radius:4px;font-size:11px;font-weight:600;color:#FFFFFF;margin-left:6px;">' + renderInlineRuns(tag, theme) + '</span>';
      }).join('');
      var originalImage = image ? '<section style="flex:0 0 90px;text-align:center;padding-left:10px;"><span leaf=""><img src="' + escapeAttr(image) + '" alt="" border="0" style="width:80px;max-width:80px;height:auto;display:block;margin:0 auto;border:0 none;border-radius:14px;"></span></section>' : '';
      return '<section style="border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #F0F0F0;background:#FFFFFF;">'
        + '<section style="margin:0;padding:8px 16px 10px;background:#FFFFFF;">'
        + '<section style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px;"><p style="margin:0;font-size:12px;font-weight:700;color:' + theme.colors.primary + ';letter-spacing:1px;white-space:nowrap;">' + leaf('● ', true) + renderInlineRuns(hero.breaking, theme) + '</p><p style="margin:0;text-align:right;font-size:13px;color:' + theme.colors.muted + ';">' + renderInlineRuns(hero.date, theme) + '</p></section>'
        + '<section style="display:flex;align-items:flex-start;gap:10px;"><section style="flex:1 1 auto;min-width:0;">'
        + (hero.subtitle ? '<p style="font-size:13px;color:' + theme.colors.primary + ';margin:0 0 4px;font-weight:500;">' + renderInlineRuns(hero.subtitle, theme) + '</p>' : '')
        + '<p style="font-size:22px;font-weight:900;line-height:1.25;margin:0 0 6px;color:' + theme.colors.title + ';">' + title + '</p>'
        + (hero.description ? '<p style="font-size:13px;line-height:1.7;color:' + theme.colors.muted + ';margin:0;">' + renderInlineRuns(hero.description, theme) + '</p>' : '')
        + '</section>' + originalImage + '</section></section>'
        + '<section style="margin:0;background:' + theme.colors.gradient + ';padding:5px 16px;display:flex;justify-content:space-between;align-items:center;gap:8px;">'
        + '<p style="margin:0;font-size:13px;font-weight:700;color:#FFFFFF;">' + renderInlineRuns(hero.barText, theme) + '</p><section style="text-align:right;">' + originalTags + '</section></section></section>';
    }

    if (theme.id === 'moyu-green') {
      return '<section style="margin:0 0 24px;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;background:#FFFFFF;">'
        + '<section style="padding:17px 18px 15px;"><section style="display:flex;gap:14px;align-items:flex-start;"><section style="flex:1 1 auto;">'
        + '<p style="margin:0 0 8px;font-size:10px;font-weight:900;letter-spacing:1.6px;color:#059669;">' + meta + '</p>' + subtitle
        + '<p style="margin:0;font-size:25px;font-weight:900;line-height:1.28;color:#111827;">' + title + '</p>' + description + '</section>' + imageHtml + '</section></section>'
        + '<section style="padding:8px 18px;background:#059669;color:#FFFFFF;">' + ((hero.barText || tags) ? (hero.barText ? '<p style="margin:0 0 4px;font-size:12px;font-weight:800;color:#FFFFFF;">' + renderInlineRuns(hero.barText, theme) + '</p>' : '') + tags : '<p style="margin:0;font-size:10px;font-weight:800;letter-spacing:2px;color:#FFFFFF;">' + leaf('MAGAZINE BRIEF', true) + '</p>') + '</section></section>';
    }
    if (theme.id === 'red-white') {
      return '<section style="margin:0 0 30px;padding:22px 20px;border-top:6px solid #DC2626;background:#FEF2F2;">'
        + '<p style="margin:0 0 12px;font-size:10px;font-weight:900;letter-spacing:2px;color:#DC2626;">' + meta + '</p>'
        + '<section style="display:flex;gap:16px;align-items:flex-start;"><section style="flex:1 1 auto;">' + subtitle
        + '<p style="margin:0;font-size:25px;font-weight:900;line-height:1.32;color:#1C1917;">' + title + '</p>' + description + bar + '</section>' + imageHtml + '</section></section>';
    }
    if (theme.id === 'graphite-minimal') {
      return '<section style="margin:0 0 34px;padding:24px 0;border-top:1px solid #27272A;border-bottom:1px solid #27272A;background:#FFFFFF;">'
        + '<p style="margin:0 0 15px;font-size:9px;font-weight:600;letter-spacing:2.4px;color:#A1A1AA;">' + meta + '</p>'
        + '<section style="display:flex;gap:20px;align-items:flex-start;"><section style="flex:1 1 auto;">' + subtitle
        + '<p style="margin:0;font-size:27px;font-weight:700;line-height:1.35;color:#27272A;">' + title + '</p>' + description + bar + '</section>' + imageHtml + '</section></section>';
    }
    if (theme.id === 'zen-whitespace') {
      return '<section style="margin:18px 0 52px;padding:28px 10px;text-align:center;border-top:1px solid #B5C8BC;border-bottom:1px solid #B5C8BC;background:#FFFFFF;">'
        + '<p style="margin:0 0 18px;font-size:9px;font-weight:600;letter-spacing:2.6px;color:#4A5D52;">' + meta + '</p>' + subtitle
        + '<p style="margin:0;font-family:\'Songti SC\',\'Noto Serif CJK SC\',serif;font-size:27px;font-weight:600;line-height:1.55;color:#2B2B2B;">' + title + '</p>'
        + description + (image ? '<section style="margin-top:24px;">' + imageHtml + '</section>' : '') + '</section>';
    }
    if (theme.id === 'moyu-ticket') {
      return '<section style="margin:4px 5px 30px;padding:20px 18px;border:2px solid #1A1A1A;border-radius:10px;background:#FFFEF8;box-shadow:6px 6px 0 #A7F3D0;">'
        + '<section style="display:flex;justify-content:space-between;gap:12px;padding-bottom:10px;border-bottom:2px dashed #1A1A1A;"><p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:900;letter-spacing:1.4px;color:#059669;">' + meta + '</p><p style="margin:0;font-size:10px;font-weight:800;color:#888888;">' + leaf('ADMIT ONE', true) + '</p></section>'
        + '<section style="display:flex;gap:14px;align-items:flex-start;padding-top:16px;"><section style="flex:1 1 auto;">' + subtitle
        + '<p style="margin:0;font-size:24px;font-weight:900;line-height:1.3;color:#1A1A1A;">' + title + '</p>' + description + bar + '</section>' + imageHtml + '</section></section>';
    }
    return '<section style="margin:0 0 28px;padding:18px;border:1px solid #BFC1B7;background:#FDFDF8;">'
      + '<section style="display:flex;justify-content:space-between;gap:12px;padding-bottom:9px;border-bottom:1px solid #BFC1B7;"><p style="margin:0;font-size:10px;font-weight:800;letter-spacing:1.5px;color:#ED7B2F;">' + meta + '</p><p style="margin:0;font-size:10px;font-weight:700;color:#65675E;">' + leaf('EDITORIAL JOURNAL', true) + '</p></section>'
      + '<section style="display:flex;gap:16px;align-items:flex-start;padding-top:15px;"><section style="flex:1 1 auto;">' + subtitle
      + '<p style="margin:0;font-size:25px;font-weight:800;line-height:1.32;color:#23251D;">' + title + '</p>' + description + bar + '</section>' + imageHtml + '</section></section>';
  }

  function renderChapterBlock(content, theme, ctx) {
    var lines = parseNonEmptyLines(content);
    var parts = splitLine(lines.shift() || '');
    var label = parts[1] || 'CHAPTER';
    var title = parts[2] || parts[1] || parts[0] || '';
    var subtitle = parts[3] || '';
    var entry = ctx.legacyChapterQueue.shift() || { index: 1, isEnding: false };
    if (isOriginalClassic(theme)) entry.displayNumber = parts[0] || String(entry.index || 1).padStart(2, '0');
    var body = lines.map(function (line) {
      return '<p style="' + paragraphStyle(theme) + '">' + renderInlineRuns(line, theme) + '</p>';
    }).join('');
    return renderChapterHeading(renderInlineRuns(title, theme), title, entry, theme, label, subtitle) + body;
  }

  function renderCaseBlock(content, theme) {
    var lines = parseNonEmptyLines(content);
    if (!lines.length) return '';
    var head = splitLine(lines.shift());
    var body = lines.map(function (line) {
      if (/^####\s*/.test(line)) {
        return '<p style="margin:0 0 8px;font-family:' + theme.fontFamily + ';font-size:14px;font-weight:800;color:' + theme.colors.title + ';">' + renderInlineRuns(line.replace(/^####\s*/, ''), theme) + '</p>';
      }
      return '<p style="margin:8px 0 0;font-family:' + theme.fontFamily + ';font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';color:' + theme.colors.body + ';">' + renderInlineRuns(line, theme) + '</p>';
    }).join('');
    if (isOriginalClassic(theme)) {
      return '<section style="border-radius:12px;overflow:hidden;margin:18px 0;border:1px solid #F0F0F0;">'
        + '<section style="background:' + theme.colors.gradient + ';padding:8px 18px;">'
        + '<p style="margin:0;"><span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:1px;margin-right:8px;">' + renderInlineRuns(head[0] || 'CASE', theme) + '</span><span style="font-size:13px;font-weight:700;color:#FFFFFF;">' + renderInlineRuns(head.slice(1).join(' | '), theme) + '</span></p></section>'
        + '<section style="padding:16px 18px;background:#FFFFFF;">' + body + '</section></section>';
    }
    return '<section style="margin:20px 0;border:1px solid ' + theme.colors.border + ';border-radius:14px;overflow:hidden;background:' + theme.colors.background + ';">'
      + '<section style="padding:10px 14px;background:' + theme.colors.primaryLight + ';border-bottom:1px solid ' + theme.colors.border + ';">'
      + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:12px;font-weight:900;color:' + theme.colors.primary + ';">' + renderInlineRuns((head[0] || 'CASE') + (head[1] ? ' · ' + head.slice(1).join(' | ') : ''), theme) + '</p>'
      + '</section>'
      + '<section style="padding:14px 16px;">' + body + '</section>'
      + '</section>';
  }

  function renderCalloutBlock(content, theme) {
    var parts = splitLine(content);
    if (isOriginalClassic(theme)) {
      return '<section style="margin:18px 0;background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:0 10px 10px 0;padding:14px 18px;">'
        + '<p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">' + leaf('⚠️ ', true) + renderInlineRuns(parts[0] || '提示', theme) + '</p>'
        + '<p style="margin:0;font-size:13px;line-height:1.7;color:#78350F;">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p></section>';
    }
    return '<section style="margin:20px 0;padding:14px 16px;border-left:3px solid ' + theme.colors.primary + ';background:' + theme.colors.surface + ';border-radius:0 12px 12px 0;">'
      + '<p style="margin:0 0 6px;font-family:' + theme.fontFamily + ';font-size:13px;font-weight:800;color:' + theme.colors.primary + ';">' + renderInlineRuns(parts[0] || '提示', theme) + '</p>'
      + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';color:' + theme.colors.body + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p>'
      + '</section>';
  }

  function renderFlowBlock(content, theme) {
    var lines = parseNonEmptyLines(content);
    if (isOriginalClassic(theme)) {
      var originalFlow = lines.map(function (line, index) {
        var parts = splitLine(line);
        var arrow = index ? '<span style="display:inline-block;padding:0 6px;color:' + theme.colors.primary + ';font-size:16px;font-weight:700;">' + leaf('→', true) + '</span>' : '';
        return arrow + '<section style="flex:1 1 0;min-width:0;padding:14px 10px;background:' + theme.colors.primaryLight + ';border-radius:10px;text-align:center;">'
          + '<p style="margin:0 0 4px;font-size:13px;font-weight:700;color:' + theme.colors.primary + ';">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
          + '<p style="margin:0;font-size:11px;color:' + theme.colors.muted + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p></section>';
      }).join('');
      return '<section style="margin:20px 0;display:flex;flex-direction:row;align-items:center;">' + originalFlow + '</section>';
    }
    var items = lines.map(function (line, index) {
      var parts = splitLine(line);
      return '<section style="flex:1 1 0;min-width:130px;padding:14px 12px;border:1px solid ' + theme.colors.border + ';border-radius:12px;background:' + theme.colors.background + ';">'
        + '<p style="margin:0 0 6px;font-family:' + theme.fontFamily + ';font-size:12px;font-weight:900;color:' + theme.colors.primary + ';">' + leaf(String(index + 1).padStart(2, '0') + ' · ', true) + renderInlineRuns(parts[0] || '步骤', theme) + '</p>'
        + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:12px;line-height:1.65;color:' + theme.colors.body + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p>'
        + '</section>';
    }).join('');
    return '<section style="margin:22px 0;display:flex;gap:10px;flex-wrap:wrap;">' + items + '</section>';
  }

  function renderVocabBlock(content, theme) {
    var entries = String(content || '').trim().split(/\n---\n/);
    var html = entries.map(function (entry) {
      var lines = parseNonEmptyLines(entry);
      if (!lines.length) return '';
      var head = splitLine(lines.shift());
      var quotes = [];
      var notes = [];
      lines.forEach(function (line) {
        if (line.charAt(0) === '>') quotes.push(line.replace(/^>\s*/, ''));
        else notes.push(line);
      });
      var quoteHtml = quotes.length ? '<section style="margin:10px 0;padding:10px 12px;background:' + theme.colors.surface + ';border-left:3px solid ' + theme.colors.primary + ';border-radius:0 8px 8px 0;"><p style="margin:0;font-family:' + theme.fontFamily + ';font-size:12px;line-height:1.7;color:' + theme.colors.body + ';">' + lineBreakLeaf(quotes.join('\n'), theme) + '</p></section>' : '';
      var noteHtml = notes.length ? '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';color:' + theme.colors.body + ';">' + lineBreakLeaf(notes.join('\n'), theme) + '</p>' : '';
      return '<section style="margin:0 0 14px;padding:14px 16px;border:1px solid ' + theme.colors.border + ';border-radius:12px;background:' + theme.colors.background + ';">'
        + '<p style="margin:0 0 4px;font-family:' + theme.fontFamily + ';font-size:15px;font-weight:900;color:' + theme.colors.primary + ';">' + renderInlineRuns(head[0] || '', theme) + '</p>'
        + '<p style="margin:0 0 8px;font-family:' + theme.fontFamily + ';font-size:12px;color:' + theme.colors.muted + ';">' + renderInlineRuns(head.slice(1).join(' | '), theme) + '</p>'
        + quoteHtml + noteHtml + '</section>';
    }).join('');
    return '<section style="margin:22px 0;">' + html + '</section>';
  }

  function renderRefCardBlock(content, theme) {
    var entries = String(content || '').trim().split(/\n---\n/);
    if (isOriginalClassic(theme)) {
      var originalEntries = entries.filter(function (entry) { return String(entry || '').trim(); });
      var originalCards = originalEntries.map(function (entry, index) {
        var parts = splitLine(entry);
        return '<section style="padding:10px 16px;' + (index + 1 < originalEntries.length ? 'border-bottom:1px solid ' + theme.colors.border + ';' : '') + '">'
          + '<p style="margin:0 0 4px;"><span style="display:inline-block;font-size:10px;font-weight:600;color:#FFFFFF;background:' + theme.colors.primary + ';padding:1px 8px;border-radius:8px;">' + renderInlineRuns(parts[0] || '', theme) + '</span></p>'
          + '<p style="margin:0;font-size:14px;line-height:1.6;color:' + theme.colors.title + ';"><strong style="font-weight:700;color:' + theme.colors.title + ';">' + renderInlineRuns(parts[1] || '', theme) + '</strong><span style="color:' + theme.colors.muted + ';font-weight:400;">' + renderInlineRuns(parts[2] ? ' — ' + parts.slice(2).join(' | ') : '', theme) + '</span></p></section>';
      }).join('');
      return '<section style="border-radius:10px;border:1px solid ' + theme.colors.border + ';overflow:hidden;margin:18px 0;">' + originalCards + '</section>';
    }
    var items = entries.map(function (entry) {
      var parts = splitLine(entry);
      if (!parts[0] && !parts[1] && !parts[2]) return '';
      return '<section style="padding:12px 14px;border-bottom:1px solid ' + theme.colors.border + ';">'
        + '<p style="margin:0 0 6px;font-family:' + theme.fontFamily + ';font-size:11px;font-weight:900;color:' + theme.colors.primary + ';">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
        + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:14px;line-height:1.7;color:' + theme.colors.title + ';"><strong style="font-weight:800;color:' + theme.colors.title + ';">' + renderInlineRuns(parts[1] || '', theme) + '</strong> <span style="color:' + theme.colors.muted + ';">' + renderInlineRuns(parts[2] ? '— ' + parts.slice(2).join(' | ') : '', theme) + '</span></p>'
        + '</section>';
    }).join('').replace(/border-bottom:1px solid [^;]+;"><\/section>$/, '">');
    return '<section style="margin:22px 0;border:1px solid ' + theme.colors.border + ';border-radius:14px;overflow:hidden;background:' + theme.colors.background + ';">' + items + '</section>';
  }

  function renderVideoBlock(content, theme, options) {
    var lines = parseNonEmptyLines(content);
    if (!lines.length) return '';
    var head = splitLine(lines[0]);
    var image = lines[1] ? resolveImageSource(lines[1], options) : '';
    if (isOriginalClassic(theme)) {
      return '<section style="background:#FFFFFF;border-radius:16px;padding:12px;margin:0 0 32px;border:2px solid ' + theme.colors.primary + ';">'
        + '<section style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
        + '<span style="width:8px;height:8px;background:' + theme.colors.primary + ';border-radius:50%;"><span leaf=""><br></span></span>'
        + '<span style="font-size:11px;color:' + theme.colors.primary + ';font-weight:700;letter-spacing:1px;">' + renderInlineRuns(head[0] || 'VIDEO', theme) + '</span>'
        + '<span style="flex:1 1 auto;height:1px;background:linear-gradient(to right,' + theme.colors.primaryLight + ',transparent);"><span leaf=""><br></span></span>'
        + '<span style="font-size:11px;color:' + theme.colors.muted + ';">' + renderInlineRuns(head.slice(1).join(' | '), theme) + '</span></section>'
        + (image ? '<section style="border-radius:10px;overflow:hidden;"><span leaf=""><img src="' + escapeAttr(image) + '" alt="" border="0" style="width:100%;height:auto;display:block;border:0 none;"></span></section>' : '<section style="width:100%;line-height:0;"><span leaf=""><br></span></section>')
        + '</section>';
    }
    return '<section style="margin:22px 0;padding:14px;border:2px solid ' + theme.colors.primary + ';border-radius:16px;background:' + theme.colors.background + ';">'
      + '<p style="margin:0 0 10px;font-family:' + theme.fontFamily + ';font-size:12px;font-weight:900;color:' + theme.colors.primary + ';">' + renderInlineRuns((head[0] || 'VIDEO') + (head[1] ? ' · ' + head.slice(1).join(' | ') : ''), theme) + '</p>'
      + (image ? '<span leaf=""><img src="' + escapeAttr(image) + '" alt="" border="0" style="max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:12px;"></span>' : '<section style="padding:22px 0;text-align:center;background:' + theme.colors.surface + ';border-radius:12px;"><p style="margin:0;font-family:' + theme.fontFamily + ';font-size:13px;color:' + theme.colors.muted + ';">' + leaf('此处可放视频封面图') + '</p></section>')
      + '</section>';
  }

  function renderFeaturesBlock(content, theme) {
    var lines = parseNonEmptyLines(content);
    if (isOriginalClassic(theme)) {
      return '<section style="margin:18px 0;">' + lines.map(function (line) {
        var parts = splitLine(line);
        return '<section style="margin-bottom:18px;">'
          + '<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:' + theme.colors.primary + ';"><span style="display:inline-block;width:7px;height:7px;background:' + theme.colors.primary + ';border-radius:50%;margin-right:6px;"><span leaf=""><br></span></span>' + renderInlineRuns(parts[0] || '', theme) + '</p>'
          + '<p style="margin:0;padding-left:13px;font-size:14px;line-height:1.75;color:' + theme.colors.body + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p></section>';
      }).join('') + '</section>';
    }
    return '<section style="margin:22px 0;">' + lines.map(function (line) {
      var parts = splitLine(line);
      return '<section style="margin:0 0 14px;padding:0 0 12px;border-bottom:1px solid ' + theme.colors.border + ';">'
        + '<p style="margin:0 0 4px;font-family:' + theme.fontFamily + ';font-size:14px;font-weight:800;color:' + theme.colors.title + ';">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
        + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';color:' + theme.colors.body + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p>'
        + '</section>';
    }).join('') + '</section>';
  }

  function renderSummaryBlock(content, theme) {
    var lines = parseNonEmptyLines(content);
    if (isOriginalClassic(theme)) {
      var originalSummary = lines.map(function (line, index) {
        var parts = splitLine(line);
        var plus = index ? '<span style="display:inline-block;color:' + theme.colors.primary + ';font-size:18px;font-weight:700;text-align:center;padding:12px 4px;">' + leaf('+', true) + '</span>' : '';
        return plus + '<section style="flex:1 1 0;min-width:0;text-align:center;padding:12px 8px;">'
          + '<p style="margin:0 0 2px;font-size:14px;font-weight:700;color:' + theme.colors.primary + ';">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
          + '<p style="margin:0;font-size:11px;color:' + theme.colors.muted + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p></section>';
      }).join('');
      return '<section style="margin:24px 0;display:flex;flex-direction:row;align-items:center;">' + originalSummary + '</section>';
    }
    var items = lines.map(function (line) {
      var parts = splitLine(line);
      return '<section style="flex:1 1 0;min-width:100px;text-align:center;padding:10px 8px;">'
        + '<p style="margin:0 0 2px;font-family:' + theme.fontFamily + ';font-size:14px;font-weight:900;color:' + theme.colors.primary + ';">' + renderInlineRuns(parts[0] || '', theme) + '</p>'
        + '<p style="margin:0;font-family:' + theme.fontFamily + ';font-size:11px;line-height:1.6;color:' + theme.colors.muted + ';">' + renderInlineRuns(parts.slice(1).join(' | '), theme) + '</p>'
        + '</section>';
    }).join('');
    return '<section style="margin:24px 0;display:flex;gap:8px;flex-wrap:wrap;border:1px solid ' + theme.colors.border + ';border-radius:14px;background:' + theme.colors.background + ';">' + items + '</section>';
  }

  function renderGalleryBlock(content, theme, options) {
    var refs = parseNonEmptyLines(content);
    if (isOriginalClassic(theme)) {
      var width = refs.length <= 1 ? '100%' : refs.length === 2 ? '49%' : refs.length === 3 ? '32%' : '24%';
      var originalGallery = refs.map(function (ref) {
        var src = resolveImageSource(ref, options);
        if (!src) return '';
        return '<section style="flex:0 0 ' + width + ';width:' + width + ';padding:2px;"><span leaf=""><img src="' + escapeAttr(src) + '" alt="" border="0" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block;border:0 none;"></span></section>';
      }).join('');
      return '<section style="margin:18px 0;display:flex;flex-direction:row;align-items:flex-start;justify-content:space-between;">' + originalGallery + '</section>';
    }
    var items = refs.map(function (ref) {
      var src = resolveImageSource(ref, options);
      if (!src) return '';
      return '<section style="flex:1 1 180px;"><span leaf=""><img src="' + escapeAttr(src) + '" alt="" border="0" style="max-width:100%;height:auto;display:block;margin:0 auto;border:0 none;border-radius:10px;"></span></section>';
    }).join('');
    return '<section style="margin:22px 0;display:flex;gap:8px;flex-wrap:wrap;">' + items + '</section>';
  }

  function renderEndBlock(content, theme) {
    var label = String(content || '').trim() || (theme.skeleton && theme.skeleton.endingLabel) || 'END';
    if (isOriginalClassic(theme)) {
      return '<section style="text-align:center;padding:28px 0 8px;margin-top:32px;border-top:1px solid ' + theme.colors.border + ';"><p style="font-size:11px;font-weight:600;color:' + theme.colors.muted + ';letter-spacing:3px;margin:0;">' + renderInlineRuns(label, theme) + '</p></section>';
    }
    if (theme.id === 'moyu-green') {
      return '<section style="margin:38px 0 12px;padding:18px 0 0;border-top:3px solid #059669;text-align:center;"><p style="margin:0;font-family:' + theme.fontFamily + ';font-size:11px;font-weight:900;letter-spacing:2.5px;color:#059669;">' + renderInlineRuns('/// ' + label, theme) + '</p></section>';
    }
    if (theme.id === 'red-white') {
      return '<section style="margin:44px 0 12px;padding-top:18px;border-top:2px solid #DC2626;text-align:center;"><p style="margin:0;font-family:' + theme.fontFamily + ';font-size:10px;font-weight:900;letter-spacing:3px;color:#DC2626;">' + renderInlineRuns(label, theme) + '</p></section>';
    }
    if (theme.id === 'graphite-minimal') {
      return '<section style="margin:48px 0 14px;display:flex;gap:14px;align-items:center;"><section style="flex:1 1 auto;height:1px;background:#E4E4E7;font-size:0;line-height:0;"><span leaf=""><br></span></section><p style="margin:0;font-family:Georgia,serif;font-size:11px;letter-spacing:3px;color:#52525B;">' + renderInlineRuns(label, theme) + '</p><section style="flex:1 1 auto;height:1px;background:#E4E4E7;font-size:0;line-height:0;"><span leaf=""><br></span></section></section>';
    }
    if (theme.id === 'zen-whitespace') {
      return '<section style="margin:64px 0 18px;text-align:center;"><section style="width:42px;height:1px;margin:0 auto 18px;background:#B5C8BC;font-size:0;line-height:0;"><span leaf=""><br></span></section><p style="margin:0;font-family:\'Songti SC\',\'Noto Serif CJK SC\',serif;font-size:10px;letter-spacing:3px;color:#4A5D52;">' + renderInlineRuns(label, theme) + '</p></section>';
    }
    if (theme.id === 'moyu-ticket') {
      return '<section style="margin:34px 4px 12px;padding:15px 8px;border-top:2px dashed #1A1A1A;border-bottom:2px dashed #1A1A1A;text-align:center;background:#FFFEF8;"><p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:900;letter-spacing:2px;color:#1A1A1A;">' + renderInlineRuns('/ ' + label + ' /', theme) + '</p></section>';
    }
    return '<section style="margin:38px 0 12px;padding:18px;background:#23251D;text-align:center;"><p style="margin:0;font-family:' + theme.fontFamily + ';font-size:10px;font-weight:800;letter-spacing:2.5px;color:#ED7B2F;">' + renderInlineRuns('/// ' + label, theme) + '</p></section>';
  }

  function renderSignature(theme, options) {
    var author = String(options.author || '').trim();
    var bio = String(options.bio || '').trim();
    var introText = author ? '我是 ' + author + (bio ? '，' + bio : '') : bio;
    if (introText && !/[。！？!?]$/.test(introText)) introText += '。';
    var intro = introText ? leaf(introText) : '';
    var introParagraph = function (style) {
      return intro ? '<p style="' + style + '">' + intro + '</p>' : '';
    };
    var action = leaf('如果你觉得这篇内容有帮助，欢迎点赞、在看、转发。');
    if (theme.id === 'moyu-green') {
      return '<section style="margin:30px 0 0;padding:17px 18px;border-radius:14px;background:#ECFDF5;border:1px solid #A7F3D0;">' + introParagraph('margin:0 0 9px;font-size:14px;font-weight:800;line-height:1.8;color:#111827;') + '<p style="margin:0;font-size:12px;line-height:1.7;color:#059669;">' + action + '</p></section>';
    }
    if (theme.id === 'red-white') {
      return '<section style="margin:30px 0 0;padding:18px 0 0;border-top:4px solid #DC2626;">' + introParagraph('margin:0 0 9px;font-size:14px;font-weight:800;line-height:1.8;color:#1C1917;') + '<p style="margin:0;font-size:12px;line-height:1.7;color:#9CA3AF;">' + action + '</p></section>';
    }
    if (theme.id === 'graphite-minimal') {
      return '<section style="margin:32px 0 0;padding:18px;border:1px solid #E4E4E7;background:#FAFAFA;">' + introParagraph('margin:0 0 10px;font-size:14px;font-weight:700;line-height:1.8;color:#27272A;') + '<p style="margin:0;font-size:11px;line-height:1.8;letter-spacing:0.4px;color:#A1A1AA;">' + action + '</p></section>';
    }
    if (theme.id === 'zen-whitespace') {
      return '<section style="margin:42px 0 0;padding:24px 10px;border-top:1px solid #E8E8E8;text-align:center;">' + introParagraph('margin:0 0 12px;font-family:\'Songti SC\',\'Noto Serif CJK SC\',serif;font-size:14px;line-height:2;color:#2B2B2B;') + '<p style="margin:0;font-size:11px;line-height:1.9;color:#A3A3A3;">' + action + '</p></section>';
    }
    if (theme.id === 'moyu-ticket') {
      return '<section style="margin:30px 5px 0;padding:16px 18px;border:2px solid #1A1A1A;background:#FFFEF8;box-shadow:5px 5px 0 #A7F3D0;">' + introParagraph('margin:0 0 9px;font-size:14px;font-weight:900;line-height:1.8;color:#1A1A1A;') + '<p style="margin:0;font-size:12px;font-weight:700;line-height:1.7;color:#059669;">' + action + '</p></section>';
    }
    return '<section style="margin:30px 0 0;padding:17px 18px;border-left:5px solid #ED7B2F;background:#EEEFE9;">' + introParagraph('margin:0 0 9px;font-size:14px;font-weight:800;line-height:1.8;color:#23251D;') + '<p style="margin:0;font-size:12px;line-height:1.7;color:#65675E;">' + action + '</p></section>';
  }

  function renderAutoToc(theme, chapters) {
    if (!chapters.length) return '';
    var selected = chapters;
    if (theme.id === 'moyu-green') {
      return '<section style="margin:20px 0 26px;"><p style="margin:0 0 9px;font-size:11px;font-weight:900;letter-spacing:1.4px;color:#059669;">' + leaf('本文导读') + '</p><section style="display:flex;gap:8px;flex-wrap:wrap;">' + selected.map(function (title, index) {
        var active = index === 0;
        return '<section style="flex:1 1 110px;padding:11px 12px;border:1px solid ' + (active ? '#059669' : '#E5E7EB') + ';border-radius:10px;background:' + (active ? '#059669' : '#FFFFFF') + ';"><p style="margin:0 0 4px;font-size:10px;font-weight:900;color:' + (active ? '#FFFFFF' : '#9CA3AF') + ';">' + leaf('PART ' + String(index + 1).padStart(2, '0'), true) + '</p><p style="margin:0;font-size:12px;font-weight:700;line-height:1.55;color:' + (active ? '#FFFFFF' : '#111827') + ';">' + leaf(title) + '</p></section>';
      }).join('') + '</section></section>';
    }
    if (theme.id === 'red-white') {
      return '<section style="margin:26px 0 30px;padding:16px 18px;border-top:3px solid #DC2626;background:#FEF2F2;"><p style="margin:0 0 10px;font-size:10px;font-weight:900;letter-spacing:1.6px;color:#DC2626;">' + leaf('本文看点') + '</p>' + selected.map(function (title, index) {
        return '<section style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #FECACA;"><span style="min-width:25px;font-size:12px;font-weight:900;color:#DC2626;">' + leaf(String(index + 1).padStart(2, '0'), true) + '</span><span style="font-size:13px;font-weight:700;line-height:1.6;color:#1C1917;">' + leaf(title) + '</span></section>';
      }).join('') + '</section>';
    }
    if (theme.id === 'graphite-minimal') {
      return '<section style="margin:28px 0 32px;padding:18px 0;border-top:1px solid #52525B;border-bottom:1px solid #E4E4E7;background:#FAFAFA;"><p style="margin:0 16px 12px;font-size:9px;font-weight:600;letter-spacing:2px;color:#A1A1AA;">' + leaf('CONTENTS', true) + '</p><section style="display:flex;gap:0;flex-wrap:wrap;">' + selected.map(function (title, index) {
        return '<section style="flex:1 1 120px;padding:5px 16px;border-left:1px solid #E4E4E7;"><p style="margin:0 0 5px;font-family:Georgia,serif;font-size:18px;color:#A1A1AA;">' + leaf(String(index + 1).padStart(2, '0'), true) + '</p><p style="margin:0;font-size:12px;line-height:1.6;color:#27272A;">' + leaf(title) + '</p></section>';
      }).join('') + '</section></section>';
    }
    return '<section style="margin:38px 0 44px;padding:0;border-top:1px solid #E8E8E8;">' + selected.map(function (title, index) {
      return '<section style="display:flex;gap:14px;padding:13px 0;border-bottom:1px solid #E8E8E8;"><span style="min-width:26px;font-size:10px;letter-spacing:1px;color:#4A5D52;">' + leaf(String(index + 1).padStart(2, '0'), true) + '</span><span style="font-family:\'Songti SC\',\'Noto Serif CJK SC\',serif;font-size:13px;line-height:1.7;color:#2B2B2B;">' + leaf(title) + '</span></section>';
    }).join('') + '</section>';
  }

  function injectAutoToc(source, theme, ctx, options) {
    var skeleton = theme.skeleton || {};
    if (options && options.autoToc === false) return source;
    if (!ctx.autoTocHtml || ctx.hasExplicitToc || !skeleton.hasToc) return source;
    if (ctx.chapters.length < (skeleton.autoTocMinChapters || 99)) return source;
    if (skeleton.tocPlacement === 'after-cover' && ctx.firstHeroToken) {
      return source.replace(ctx.firstHeroToken, ctx.firstHeroToken + '\n<!--GZH_AUTO_TOC-->');
    }
    if (skeleton.tocPlacement === 'before-first-chapter') {
      if (ctx.firstChapterToken) {
        return source.replace(ctx.firstChapterToken, '<!--GZH_AUTO_TOC-->\n' + ctx.firstChapterToken);
      }
      var match = source.match(/^##\s+.+$/m);
      if (match) {
        return source.replace(match[0], '<!--GZH_AUTO_TOC-->\n' + match[0]);
      }
    }
    return '<!--GZH_AUTO_TOC-->\n' + source;
  }

  function extractBlocks(source, theme, options, ctx) {
    var counter = 0;
    var blocks = {};
    function replace(tag, factory) {
      var pattern = new RegExp('\\[' + tag + '\\]([\\s\\S]*?)\\[\\/' + tag + '\\]', 'g');
      source = source.replace(pattern, function (_, content) {
        counter += 1;
        var token = '<!--GZH_BLOCK_' + counter + '-->';
        blocks[token] = factory(content);
        return token;
      });
    }

    replace('HERO', function (content) {
      ctx.hasHero = true;
      var token = renderHeroBlock(content, theme, options, ctx);
      if (!ctx.firstHeroToken) ctx.firstHeroToken = '<!--GZH_BLOCK_' + counter + '-->';
      return token;
    });
    replace('PART', function (content) { return renderPartBlock(content, theme, ctx); });
    replace('CHAPTER', function (content) {
      if (!ctx.firstChapterToken) ctx.firstChapterToken = '<!--GZH_BLOCK_' + counter + '-->';
      return renderChapterBlock(content, theme, ctx);
    });
    replace('CASE', function (content) { return renderCaseBlock(content, theme); });
    replace('CALLOUT', function (content) { return renderCalloutBlock(content, theme); });
    replace('FLOW', function (content) { return renderFlowBlock(content, theme); });
    replace('VOCAB', function (content) { return renderVocabBlock(content, theme); });
    replace('REFCARD', function (content) { return renderRefCardBlock(content, theme); });
    replace('VIDEO', function (content) { return renderVideoBlock(content, theme, options); });
    replace('FEATURES', function (content) { return renderFeaturesBlock(content, theme); });
    replace('SUMMARY', function (content) { return renderSummaryBlock(content, theme); });
    replace('GALLERY', function (content) { return renderGalleryBlock(content, theme, options); });
    replace('END', function (content) {
      ctx.hasExplicitEnd = true;
      ctx.endLabel = String(content || '').trim();
      return '';
    });

    return { source: source, blocks: blocks };
  }

  function replaceTokens(html, replacements) {
    Object.keys(replacements).forEach(function (token) {
      html = html.split(token).join(replacements[token]);
    });
    return html;
  }

  function renderDocumentBody(markdown, options, ctx) {
    var theme = GzhThemes.resolve(options.themeId);
    var protectedSource = protectCodeFences(markdown);
    collectStructure(protectedSource.source, ctx);
    var extracted = extractBlocks(protectedSource.source, theme, options, ctx);
    if (theme.skeleton && theme.skeleton.hasCover && !ctx.hasHero && ctx.title) {
      var coverToken = '<!--GZH_SYNTH_COVER-->';
      extracted.blocks[coverToken] = renderHeroBlock('FEATURE |\n' + ctx.title, theme, options, ctx);
      extracted.source = coverToken + '\n' + extracted.source;
      ctx.firstHeroToken = coverToken;
    }
    extracted.source = replaceTokens(extracted.source, protectedSource.fences);
    ctx.autoTocHtml = renderAutoToc(theme, ctx.chapters);
    var sourceWithToc = injectAutoToc(extracted.source, theme, ctx, options);
    var html = renderMarkdown(sourceWithToc, theme, options, ctx);
    html = replaceTokens(html, extracted.blocks);
    html = html.split('<!--GZH_AUTO_TOC-->').join(ctx.autoTocHtml || '');
    return { html: html, theme: theme };
  }

  function wrapRoot(innerHtml, theme, options, ctx) {
    var skeleton = theme.skeleton || {};
    var signature = options.appendSignature && skeleton.hasSignature !== false ? renderSignature(theme, options) : '';
    var ending = (ctx.hasExplicitEnd || skeleton.autoEnding !== false) ? renderEndBlock(ctx.endLabel, theme) : '';
    var tail = (theme.id === 'moyu-green' || theme.id === 'moyu-ticket') ? signature + ending : ending + signature;
    var root = '<section style="margin:0 auto;max-width:677px;background:' + theme.colors.background + ';padding:' + theme.contentPadding + ';font-family:' + theme.fontFamily + ';font-size:' + theme.fontSize + ';line-height:' + theme.lineHeight + ';color:' + theme.colors.body + ';">'
      + innerHtml + tail + '</section>';
    if (theme.id === 'moyu-ticket' || theme.id === 'olive-journal') {
      root += '<p style="display:none;"><mp-style-type data-value="3"></mp-style-type></p>';
    }
    return root;
  }

  function renderWithMeta(markdown, options) {
    options = options || {};
    var effectiveOptions = {
      themeId: options.themeId || GzhThemes.defaultId,
      resolveImage: options.resolveImage,
      autoToc: options.autoToc !== false,
      appendSignature: options.appendSignature !== false,
      author: options.author || '',
      bio: options.bio || ''
    };
    var ctx = {
      title: '',
      chapters: [],
      standardChapterQueue: [],
      legacyChapterQueue: [],
      quoteCount: 0,
      hasExplicitToc: false,
      hasExplicitEnd: false,
      hasHero: false,
      firstHeroToken: '',
      firstChapterToken: '',
      autoTocHtml: '',
      endLabel: ''
    };
    var normalized = normalizeMarkdown(markdown);
    var rendered = renderDocumentBody(normalized, effectiveOptions, ctx);
    var html = wrapRoot(rendered.html, rendered.theme, effectiveOptions, ctx);
    return {
      html: html,
      themeId: rendered.theme.id,
      title: ctx.title || rendered.theme.name,
      chapterCount: ctx.chapters.length
    };
  }

  function render(markdown, options) {
    return renderWithMeta(markdown, options).html;
  }

  function validate(html) {
    var errors = [];
    var warnings = [];
    var source = String(html || '');

    FORBIDDEN.forEach(function (item) {
      var matches = source.match(item.rx);
      if (matches && matches.length) {
        errors.push(item.message + '（命中 ' + matches.length + ' 处）');
      }
    });

    var stack = [];
    var leafDepth = 0;
    var codeDepth = 0;
    var leafCount = 0;
    var unwrapped = [];
    var halfPunct = [];
    var codeStyle = /monospace|white-space\s*:\s*pre|courier|consolas|sf mono/i;
    var skipTags = { head: true, title: true, style: true, script: true };
    var voidTags = { br: true, img: true, hr: true, meta: true, input: true, source: true, area: true, base: true, col: true, embed: true, link: true, param: true, track: true, wbr: true };

    function decodeText(text) {
      return text
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&#(?:39|x27);/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&#x([0-9a-f]+);/gi, function (_, number) {
          var codePoint = parseInt(number, 16);
          return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\ufffd';
        })
        .replace(/&#(\d+);/g, function (_, number) {
          var codePoint = Number(number);
          return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\ufffd';
        });
    }

    function closeTag(tag) {
      for (var index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.slice(index).forEach(function (entry) {
            if (entry.leaf) leafDepth -= 1;
            if (entry.code) codeDepth -= 1;
          });
          stack.length = index;
          return;
        }
      }
    }

    var tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+|</g;
    var token;
    while ((token = tokenPattern.exec(source))) {
      var value = token[0];
      if (value.slice(0, 4) === '<!--' || /^<![^-]/.test(value)) continue;
      if (value.charAt(0) === '<' && /^<\//.test(value)) {
        var endName = value.match(/^<\/\s*([A-Za-z0-9-]+)/);
        if (endName) closeTag(endName[1].toLowerCase());
        continue;
      }
      if (value.charAt(0) === '<' && /^<[A-Za-z]/.test(value)) {
        var startName = value.match(/^<\s*([A-Za-z0-9-]+)/);
        if (!startName) continue;
        var tag = startName[1].toLowerCase();
        var isLeaf = tag === 'span' && /(?:^|\s)leaf(?:\s*=|\s|\/?>)/i.test(value);
        var styleMatch = value.match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        var isCode = codeStyle.test((styleMatch && (styleMatch[1] || styleMatch[2])) || '');
        if (isLeaf) {
          leafCount += 1;
          leafDepth += 1;
        }
        if (isCode) codeDepth += 1;
        if (!voidTags[tag] && !/\/\s*>$/.test(value)) {
          stack.push({ tag: tag, leaf: isLeaf, code: isCode });
        } else {
          if (isLeaf) leafDepth -= 1;
          if (isCode) codeDepth -= 1;
        }
        continue;
      }
      var textValue = decodeText(value).trim();
      if (!textValue || !CJK_RE.test(textValue)) continue;
      if (stack.some(function (entry) { return skipTags[entry.tag]; })) continue;
      if (leafDepth === 0) {
        unwrapped.push({ text: textValue.slice(0, 24), parent: stack.length ? stack[stack.length - 1].tag : '(root)' });
      }
      if (codeDepth === 0 && (/[\u3400-\u9fff][,;!?]/.test(textValue) || /["']/.test(textValue))) {
        halfPunct.push(textValue.slice(0, 24));
      }
    }

    if (CJK_RE.test(source) && !leafCount) {
      errors.push('全文没有任何 <span leaf=""> 包裹——粘贴到公众号后样式会大面积丢失');
    } else if (unwrapped.length) {
      var sample = unwrapped.slice(0, 5).map(function (item) {
        return '「' + item.text + '」(在 <' + item.parent + '> 内)';
      }).join('；');
      warnings.push(unwrapped.length + ' 处中文文本未被 <span leaf> 包裹，样式可能丢失。例：' + sample);
    }
    if (halfPunct.length) {
      warnings.push(halfPunct.length + ' 处正文疑似半角标点/英文引号，应改中文全角（代码块内不计）。例：' + halfPunct.slice(0, 5).map(function (item) { return '「' + item + '」'; }).join('；'));
    }

    return { errors: errors, warnings: warnings, leafCount: leafCount };
  }

  var api = {
    render: render,
    renderWithMeta: renderWithMeta,
    validate: validate
  };

  global.GzhRenderer = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
