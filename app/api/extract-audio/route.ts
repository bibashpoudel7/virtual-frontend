import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const service = searchParams.get('service');

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // Audio.com extraction
    if (service === 'audio.com' || url.includes('audio.com')) {
      return await extractFromAudioCom(url);
    }

    // Jumpshare extraction
    if (service === 'jumpshare' || url.includes('jumpshare.com')) {
      return await extractFromJumpshare(url);
    }

    return NextResponse.json({
      success: false,
      error: 'Unsupported service',
      originalUrl: url
    });

  } catch (error) {
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Extraction failed',
        success: false
      },
      { status: 500 }
    );
  }
}

async function extractFromAudioCom(url: string) {
  try {
    // Try different user agents to avoid blocking
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    let html = '';
    let fetchSuccess = false;

    // Try different user agents
    for (const userAgent of userAgents) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'DNT': '1',
            'Connection': 'keep-alive',
          }
        });

        if (response.ok) {
          html = await response.text();
          fetchSuccess = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!fetchSuccess) {
      throw new Error('Failed to fetch page');
    }

    // Look for audio.com specific patterns (simplified)
    const audioComPatterns = [
      /https?:\/\/[^"'\s]*\.mp3[^"'\s]*/gi,
      /https?:\/\/[^"'\s]*\.wav[^"'\s]*/gi,
      /https?:\/\/[^"'\s]*\.m4a[^"'\s]*/gi,
      /https?:\/\/[^"'\s]*\.ogg[^"'\s]*/gi,
    ];

    const foundUrls = new Set<string>();

    for (const pattern of audioComPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach(match => {
          let cleanUrl = match.replace(/['"]/g, '');
          if (cleanUrl.startsWith('http') && (
            cleanUrl.includes('.mp3') || 
            cleanUrl.includes('.wav') || 
            cleanUrl.includes('.m4a') || 
            cleanUrl.includes('.ogg')
          )) {
            foundUrls.add(cleanUrl);
          }
        });
      }
    }

    // Test found URLs (limit to first 5 for performance)
    const urlsToTest = Array.from(foundUrls).slice(0, 5);
    
    for (const testUrl of urlsToTest) {
      try {
        const testResponse = await fetch(testUrl, { 
          method: 'HEAD',
          headers: {
            'User-Agent': userAgents[0],
            'Accept': 'audio/*,*/*;q=0.1',
            'Range': 'bytes=0-1024',
          }
        });
        
        if (testResponse.ok) {
          const contentType = testResponse.headers.get('content-type');
          
          if (contentType?.startsWith('audio/') || 
              contentType?.includes('mpeg') || 
              contentType?.includes('wav') ||
              contentType?.includes('ogg') ||
              contentType?.includes('octet-stream')) {
            
            return NextResponse.json({
              success: true,
              audioUrl: testUrl,
              originalUrl: url,
              method: 'extraction'
            });
          }
        }
      } catch (error) {
        continue;
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Could not extract direct audio URL from audio.com',
      originalUrl: url,
      suggestion: 'Please upload audio files directly to your server for best results.'
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Audio extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      originalUrl: url
    });
  }
}

async function extractFromJumpshare(url: string) {
  try {
    // Convert Jumpshare share URL to download URL
    if (url.includes('/share/')) {
      const shareId = url.split('/share/')[1];
      const downloadUrl = `https://jumpshare.com/s/${shareId}/download`;
      
      // Test if the download URL works
      const testResponse = await fetch(downloadUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (testResponse.ok) {
        const contentType = testResponse.headers.get('content-type');
        if (contentType?.startsWith('audio/') || contentType?.includes('octet-stream')) {
          return NextResponse.json({
            success: true,
            audioUrl: downloadUrl,
            originalUrl: url,
            method: 'jumpshare_conversion'
          });
        }
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Could not convert Jumpshare URL to direct download',
      originalUrl: url,
      suggestion: 'Try uploading the audio file directly instead'
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Jumpshare extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      originalUrl: url
    });
  }
}