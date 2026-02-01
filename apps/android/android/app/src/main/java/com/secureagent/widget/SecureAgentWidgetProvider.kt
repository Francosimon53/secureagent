package com.secureagent.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.secureagent.MainActivity
import com.secureagent.R

/**
 * SecureAgent Home Screen Widget
 *
 * Provides quick access to SecureAgent directly from the home screen.
 */
class SecureAgentWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onEnabled(context: Context) {
        // Widget enabled for the first time
    }

    override fun onDisabled(context: Context) {
        // Widget disabled (all instances removed)
    }

    companion object {
        internal fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_secureagent)

            // Main widget tap - open app
            val openAppIntent = Intent(context, MainActivity::class.java)
            val openAppPendingIntent = PendingIntent.getActivity(
                context,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_container, openAppPendingIntent)

            // Quick action buttons
            val actions = listOf(
                Triple(R.id.btn_summarize, "summarize", "Summarize"),
                Triple(R.id.btn_translate, "translate", "Translate"),
                Triple(R.id.btn_explain, "explain", "Explain"),
                Triple(R.id.btn_grammar, "grammar", "Grammar")
            )

            for ((buttonId, action, _) in actions) {
                val actionIntent = Intent(context, MainActivity::class.java).apply {
                    putExtra("quick_action", action)
                }
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    buttonId,
                    actionIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(buttonId, pendingIntent)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
