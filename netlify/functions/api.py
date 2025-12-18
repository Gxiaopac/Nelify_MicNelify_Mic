"""
Netlify Serverless Function for Flask API
将 Flask 应用包装为 Netlify Function
"""
import sys
import os
import json

# 添加项目根目录到路径
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))
sys.path.insert(0, project_root)

# 设置工作目录
os.chdir(project_root)

try:
    from serverless_wsgi import handle_request
    from app import app
    
    def handler(event, context):
        """Netlify Function 处理函数"""
        # Redirect 规则：/api/* -> /.netlify/functions/api/:splat
        # 例如：/api/config -> /.netlify/functions/api/config
        # 需要将路径转换为 Flask 期望的格式：/api/config
        
        original_path = event.get('path', '')
        
        # 处理 Netlify Functions 路径
        # 如果路径是 /.netlify/functions/api/xxx，提取 xxx 部分并加上 /api 前缀
        if original_path.startswith('/.netlify/functions/api/'):
            # 移除 /.netlify/functions/api 前缀
            remaining = original_path[len('/.netlify/functions/api'):]
            # 确保 remaining 以 / 开头
            if not remaining.startswith('/'):
                remaining = '/' + remaining
            # 加上 /api 前缀
            event['path'] = '/api' + remaining
        elif original_path.startswith('/api/'):
            # 如果已经是 /api/ 开头，直接使用
            event['path'] = original_path
        else:
            # 其他情况，添加 /api 前缀
            if original_path.startswith('/'):
                event['path'] = '/api' + original_path
            else:
                event['path'] = '/api/' + original_path
        
        # 确保 queryString 也被正确传递
        if 'queryStringParameters' not in event or event['queryStringParameters'] is None:
            event['queryStringParameters'] = {}
        
        # 确保 httpMethod 存在
        if 'httpMethod' not in event:
            event['httpMethod'] = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
        
        try:
            return handle_request(app, event, context)
        except Exception as e:
            # 如果处理失败，返回错误信息
            import traceback
            error_trace = traceback.format_exc()
            return {
                'statusCode': 500,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({
                    'error': str(e),
                    'trace': error_trace,
                    'original_path': original_path,
                    'processed_path': event.get('path', '')
                })
            }
except ImportError as e:
    # 如果导入失败，返回错误信息
    def handler(event, context):
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': f'Import error: {str(e)}', 'message': 'Please ensure serverless-wsgi is installed'})
        }


