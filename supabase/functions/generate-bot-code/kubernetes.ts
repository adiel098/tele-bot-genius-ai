
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface KubernetesConfig {
  namespace: string;
  replicas: number;
  resources: {
    memory: string;
    cpu: string;
  };
}

// Generate Helm chart for bot deployment
export function generateHelmChart(botId: string, botName: string, config: KubernetesConfig) {
  const chartYaml = `
apiVersion: v2
name: telegram-bot-${botId}
description: Telegram Bot Helm Chart
type: application
version: 1.0.0
appVersion: "1.0"
`;

  const valuesYaml = `
# Default values for telegram-bot
replicaCount: ${config.replicas}

image:
  repository: telegram-bot-${botId}
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

resources:
  limits:
    cpu: ${config.resources.cpu}
    memory: ${config.resources.memory}
  requests:
    cpu: "50m"
    memory: "64Mi"

nodeSelector: {}
tolerations: []
affinity: {}

bot:
  name: "${botName}"
  namespace: "${config.namespace}"
`;

  const deploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "telegram-bot.fullname" . }}
  labels:
    {{- include "telegram-bot.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "telegram-bot.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "telegram-bot.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            - name: BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: bot-secret-${botId}
                  key: token
            - name: LOG_LEVEL
              value: "INFO"
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
`;

  const serviceYaml = `
apiVersion: v1
kind: Service
metadata:
  name: {{ include "telegram-bot.fullname" . }}
  labels:
    {{- include "telegram-bot.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "telegram-bot.selectorLabels" . | nindent 4 }}
`;

  const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: bot-secret-${botId}
  namespace: {{ .Values.bot.namespace }}
type: Opaque
data:
  token: {{ .Values.bot.token | b64enc }}
`;

  const helpersYaml = `
{{/*
Expand the name of the chart.
*/}}
{{- define "telegram-bot.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "telegram-bot.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "telegram-bot.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "telegram-bot.labels" -}}
helm.sh/chart: {{ include "telegram-bot.chart" . }}
{{ include "telegram-bot.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "telegram-bot.selectorLabels" -}}
app.kubernetes.io/name: {{ include "telegram-bot.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
`;

  return {
    'Chart.yaml': chartYaml,
    'values.yaml': valuesYaml,
    'templates/deployment.yaml': deploymentYaml,
    'templates/service.yaml': serviceYaml,
    'templates/secret.yaml': secretYaml,
    'templates/_helpers.tpl': helpersYaml
  };
}

// Generate enhanced Dockerfile with health checks
export function generateDockerfile(files: Record<string, string>) {
  return `
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot files
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app \\
    && chown -R app:app /app
USER app

# Health check endpoint
COPY healthcheck.py .

# Expose port for health checks
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD python healthcheck.py

# Run the bot
CMD ["python", "main.py"]
`;
}

// Generate health check script
export function generateHealthCheck() {
  return `
import os
import sys
import time
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "healthy", "timestamp": "' + 
                           str(int(time.time())).encode() + b'"}')
        elif self.path == '/ready':
            # Check if bot is ready (you can add more sophisticated checks)
            bot_token = os.getenv('BOT_TOKEN')
            if bot_token:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "ready"}')
            else:
                self.send_response(503)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "not ready", "error": "missing bot token"}')
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    try:
        server = HTTPServer(('0.0.0.0', 8080), HealthHandler)
        print("Health check server running on port 8080")
        server.serve_forever()
    except Exception as e:
        print(f"Health check failed: {e}")
        sys.exit(1)
`;
}

export async function deployToKubernetes(botId: string, userId: string, botName: string, files: Record<string, string>) {
  try {
    // Create Kubernetes configuration
    const kubernetesConfig: KubernetesConfig = {
      namespace: `telegram-bots-${userId.substring(0, 8)}`,
      replicas: 1,
      resources: {
        memory: "128Mi",
        cpu: "100m"
      }
    };

    // Generate Helm chart
    const helmChart = generateHelmChart(botId, botName, kubernetesConfig);
    
    // Generate enhanced Dockerfile
    const dockerfile = generateDockerfile(files);
    
    // Generate health check
    const healthCheck = generateHealthCheck();

    // Upload Helm chart files to storage
    const helmFiles = {
      ...helmChart,
      'Dockerfile': dockerfile,
      'healthcheck.py': healthCheck,
      ...files
    };

    // Store Helm chart in storage
    for (const [filename, content] of Object.entries(helmFiles)) {
      const filePath = `${userId}/${botId}/helm/${filename}`;
      await supabase.storage
        .from('bot-files')
        .upload(filePath, new Blob([content], { type: 'text/plain' }), {
          upsert: true
        });
    }

    // Log deployment information
    const deploymentLogs = `
[${new Date().toISOString()}] Generated Kubernetes deployment configuration
[${new Date().toISOString()}] Namespace: ${kubernetesConfig.namespace}
[${new Date().toISOString()}] Resources: CPU=${kubernetesConfig.resources.cpu}, Memory=${kubernetesConfig.resources.memory}
[${new Date().toISOString()}] Helm chart created with health checks
[${new Date().toISOString()}] Ready for deployment to Kubernetes cluster
[${new Date().toISOString()}] Use: helm install bot-${botId} ./helm-chart
`;

    // Update bot with Kubernetes deployment info
    await supabase
      .from('bots')
      .update({
        runtime_status: 'k8s-ready',
        runtime_logs: deploymentLogs,
        deployment_config: {
          type: 'kubernetes',
          namespace: kubernetesConfig.namespace,
          helm_chart_path: `${userId}/${botId}/helm/`,
          resources: kubernetesConfig.resources
        }
      })
      .eq('id', botId);

    return {
      success: true,
      namespace: kubernetesConfig.namespace,
      helmChartPath: `${userId}/${botId}/helm/`,
      deploymentCommand: `helm install bot-${botId} ./helm-chart --set bot.token=${process.env.BOT_TOKEN}`
    };

  } catch (error) {
    console.error('Kubernetes deployment preparation failed:', error);
    throw error;
  }
}
