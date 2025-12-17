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
        # 确保传给 Flask 的路径以 /api/ 开头
        path = event.get('path', '')
        if path.startswith('/.netlify/functions/api/'):
            event['path'] = path.replace('/.netlify/functions/api', '', 1)
        # 若依然未带 /api 前缀，则补上
        if not event['path'].startswith('/api/'):
            event['path'] = '/api' + event['path']

        return handle_request(app, event, context)
except ImportError as e:
    # 如果导入失败，返回错误信息
    def handler(event, context):
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': f'Import error: {str(e)}', 'message': 'Please ensure serverless-wsgi is installed'})
        }


