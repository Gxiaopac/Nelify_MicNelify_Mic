"""
简单的测试函数，用于验证 Netlify Functions 是否正常工作
"""
import json

def handler(event, context):
    """简单的测试函数"""
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'status': 'success',
            'message': 'Netlify Functions 工作正常！',
            'path': event.get('path', ''),
            'method': event.get('httpMethod', 'GET')
        })
    }

