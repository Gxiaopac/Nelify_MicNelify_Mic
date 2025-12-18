"""
简化版本的 API 函数，用于诊断问题
如果这个能工作，说明问题在 serverless-wsgi 或 Flask 应用
"""
import json

def handler(event, context):
    """简化的处理函数，直接返回 JSON"""
    original_path = event.get('path', '')
    
    # 简单的路径处理
    if original_path.startswith('/.netlify/functions/api/'):
        remaining = original_path[len('/.netlify/functions/api'):]
        if not remaining.startswith('/'):
            remaining = '/' + remaining
        path = '/api' + remaining
    elif original_path.startswith('/api/'):
        path = original_path
    else:
        path = '/api' + (original_path if original_path.startswith('/') else '/' + original_path)
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'status': 'success',
            'message': '简化版 API 函数工作正常',
            'original_path': original_path,
            'processed_path': path,
            'httpMethod': event.get('httpMethod', 'GET'),
            'note': '如果你看到这个消息，说明 Netlify Functions 正常工作，问题可能在 Flask 应用或 serverless-wsgi'
        })
    }

